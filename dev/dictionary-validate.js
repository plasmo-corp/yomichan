/*
 * Copyright (C) 2020-2022  Yomichan Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const {performance} = require('perf_hooks');
const {JSZip} = require('./util');
const {VM} = require('./vm');

const vm = new VM();
vm.execute([
    'js/core.js',
    'js/general/cache-map.js',
    'js/data/json-schema.js'
]);
const JsonSchema = vm.get('JsonSchema');


function readSchema(relativeFileName) {
    const fileName = path.join(__dirname, relativeFileName);
    const source = fs.readFileSync(fileName, {encoding: 'utf8'});
    return JSON.parse(source);
}


async function validateDictionaryBanks(zip, fileNameFormat, schema) {
    let index = 1;
    while (true) {
        const fileName = fileNameFormat.replace(/\?/, index);

        const file = zip.files[fileName];
        if (!file) { break; }

        const data = JSON.parse(await file.async('string'));
        new JsonSchema(schema).validate(data);

        ++index;
    }
}

async function validateDictionary(archive, schemas) {
    const indexFile = archive.files['index.json'];
    if (!indexFile) {
        throw new Error('No dictionary index found in archive');
    }

    const index = JSON.parse(await indexFile.async('string'));
    const version = index.format || index.version;

    new JsonSchema(schemas.index).validate(index);

    await validateDictionaryBanks(archive, 'term_bank_?.json', version === 1 ? schemas.termBankV1 : schemas.termBankV3);
    await validateDictionaryBanks(archive, 'term_meta_bank_?.json', schemas.termMetaBankV3);
    await validateDictionaryBanks(archive, 'kanji_bank_?.json', version === 1 ? schemas.kanjiBankV1 : schemas.kanjiBankV3);
    await validateDictionaryBanks(archive, 'kanji_meta_bank_?.json', schemas.kanjiMetaBankV3);
    await validateDictionaryBanks(archive, 'tag_bank_?.json', schemas.tagBankV3);
}

function getSchemas() {
    return {
        index: readSchema('../ext/data/schemas/dictionary-index-schema.json'),
        kanjiBankV1: readSchema('../ext/data/schemas/dictionary-kanji-bank-v1-schema.json'),
        kanjiBankV3: readSchema('../ext/data/schemas/dictionary-kanji-bank-v3-schema.json'),
        kanjiMetaBankV3: readSchema('../ext/data/schemas/dictionary-kanji-meta-bank-v3-schema.json'),
        tagBankV3: readSchema('../ext/data/schemas/dictionary-tag-bank-v3-schema.json'),
        termBankV1: readSchema('../ext/data/schemas/dictionary-term-bank-v1-schema.json'),
        termBankV3: readSchema('../ext/data/schemas/dictionary-term-bank-v3-schema.json'),
        termMetaBankV3: readSchema('../ext/data/schemas/dictionary-term-meta-bank-v3-schema.json')
    };
}


async function testDictionaryFiles(dictionaryFileNames) {
    const schemas = getSchemas();

    for (const dictionaryFileName of dictionaryFileNames) {
        const start = performance.now();
        try {
            console.log(`Validating ${dictionaryFileName}...`);
            const source = fs.readFileSync(dictionaryFileName);
            const archive = await JSZip.loadAsync(source);
            await validateDictionary(archive, schemas);
            const end = performance.now();
            console.log(`No issues detected (${((end - start) / 1000).toFixed(2)}s)`);
        } catch (e) {
            const end = performance.now();
            console.log(`Encountered an error (${((end - start) / 1000).toFixed(2)}s)`);
            console.warn(e);
        }
    }
}


async function main() {
    const dictionaryFileNames = process.argv.slice(2);
    if (dictionaryFileNames.length === 0) {
        console.log([
            'Usage:',
            '  node dictionary-validate <dictionary-file-names>...'
        ].join('\n'));
        return;
    }

    await testDictionaryFiles(dictionaryFileNames);
}


if (require.main === module) { main(); }


module.exports = {
    getSchemas,
    validateDictionary,
    testDictionaryFiles
};
