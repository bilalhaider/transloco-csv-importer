#!/usr/bin/env node
const path = require('path');

require('yargs')
    .usage('Usage: $0 <command> [options]')
    .command(
        ['json', '$0'], 
        'Populates JSON file from csv', 
        (yargs) => {
            yargs
            .option('source', {
                description: 'Path to the source csv file',
                alias: 's',
                default: 'source.csv',
                type: 'string',
            })
            .option('destPath', {
                description: 'Path to the folder containing i18n json files',
                alias: 'd',
                default: path.join('src', 'assets', 'i18n'),
                type: 'string',
            });
        },
        importFromCSVToJSON
    )
    .help()
    .alias('help', 'h')
    .argv;

function importFromCSVToJSON(ar) {
    console.log('source: ', path.join(process.cwd(), ar.source));
    console.log('destPath: ', path.join(process.cwd(), ar.destPath));
}