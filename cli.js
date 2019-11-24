#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const csvParse = require("csv-parse/lib/sync");

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
            })
            .option('scopeAliases', {
                description: 'Scope aliases to be used. Multiple values can be provided, each value must be in format alias:scope',
                alias: 'a',
                type: 'array',
            })
            .option('sort', {
                description: 'Should sort keys when writing json files',
                default: true,
                type: 'boolean',
            });
        },
        importFromCSVToJSON
    )
    .help()
    .alias('help', 'h')
    .argv;

function importFromCSVToJSON(ar) {

    const time = process.hrtime();

    const sourceFilePath = path.join(process.cwd(), ar.source);
    const destPath = path.join(process.cwd(), ar.destPath);
    const shouldSort = ar.sort;
    const scopeAliases = (ar.scopeAliases || []).map(x => {

        const parts = x.split(':');

        return {
            alias: parts[0],
            scope: parts[1]
        };
    });

    console.log(`Starting csv to json operation. CSV: ${sourceFilePath}, JSON files in: ${destPath}. Aliases used: ${scopeAliases.map(x => `${x.alias}:${x.scope}`).join(',')}`);

    // check if souce file exists
    if(!fs.existsSync(sourceFilePath)) {
        console.error('File does not exist', sourceFilePath);
        return 1;
    }

    // check if destination directory exists
    if(!fs.existsSync(destPath)) {
        console.error('Directory does not exist', destPath);
        return 1;
    }

    // get all destination files
    let destination = getFiles(destPath);

    // check if there are any dest files
    if(destination.length == 0) {
        console.error('There are no files in dest directory', destPath);
        return 1;
    }

    console.debug(`Found ${destination.length} files in dest dir`);
    destination.forEach(x => console.log(x));

    // extract language names from dest file names
    destination = destination.map(x => {
        return {
            lang: path.basename(x, path.extname(x)),
            filename: x
        }
    });

    // extract unique languages in dest dir
    const languagesInFiles = [...new Set(destination.map(x => x.lang))].sort().map(x => x.toLowerCase());

    console.debug(`Found ${languagesInFiles.join(', ')} languages in dest dir`);

    let languagesInSource = [];

    // read and parse csv source file
    let records = csvParse(fs.readFileSync(sourceFilePath), {
        columns: (headerRow) => {
            headerRow = headerRow.map(x => x.toLowerCase());
            languagesInSource = headerRow.slice(1).sort();
            return headerRow;
        }
    });

    console.debug(`Found ${languagesInSource.join(', ')} languages in csv`);
    console.debug(`Found ${records.length} keys in csv`);

    // check if the languages matches between source and destination
    if(JSON.stringify(languagesInFiles) !== JSON.stringify(languagesInSource)) {
        console.error(`Languages mismatch`);
        return 1;
    }

    destination = destination
        // read and parse all destination json files
        .map(x => {
            const fileContent = fs.readFileSync(x.filename, 'utf8');
            x.contents = JSON.parse(fileContent);
            return x;
        })
        // Add meta data about keys
        .map((df, i, a) => {
            
            let prefix = path.relative(
                destPath, 
                path.dirname(df.filename)
            )
            .split(path.sep)
            .join(".");

            if(prefix != "")
                prefix = `${prefix}.`;

            // df is a single destination file here
            return Object.keys(df.contents).map(k => {
                
                // k is a single key in dest file here

                let effectiveKey = `${prefix}${k}`;

                scopeAliases.forEach(x => {
                    effectiveKey = effectiveKey.replace(x.scope, x.alias);
                });

                return {
                    keyInFile: k,
                    effectiveKey: effectiveKey,
                    lang: df.lang,
                    filename: df.filename,
                    value: df.contents[k]
                }

            });
        });

    // flatten
    destination = [].concat.apply([], destination);

    const uniqueKeysInFiles = [...new Set(destination.map(x => x.effectiveKey))].sort();

    console.debug(`Found ${uniqueKeysInFiles.length} keys in dest files`);

    const keysOnlyInRecords = records.filter(r => destination.filter(d => d.effectiveKey == r.key).length == 0).map(x => x.key);
    const keysOnlyInDestination = destination.filter(d => records.filter(r => d.effectiveKey == r.key).length == 0).map(x => x.effectiveKey);

    if(keysOnlyInRecords.length > 0 || keysOnlyInDestination.length > 0) {
        console.error('Keys not found in dest: ', keysOnlyInRecords);
        console.error('Keys not found in csv: ', keysOnlyInDestination);
        return 1;
    }

    if(uniqueKeysInFiles.length != records.length) {
        console.error("Keys mismatch");
        return 1;
    }

    // foreach source record and foreach its lang find corresponding object in destination and set its value
    records.forEach(x => {
        languagesInSource.forEach(l => {
            // updateTargets[l][x.key].value = x[l];

            destination
                .find(d => d.effectiveKey == x.key && d.lang == l)
                .value = x[l];
        });
    });

    const fileUpdates = {};

    // prepare for saving files
    destination.forEach(d => {
        if(!fileUpdates[d.filename])
            fileUpdates[d.filename] = {};

        fileUpdates[d.filename][d.keyInFile] = d.value;
    });

    // save files and sort if user specified to do so
    Object.keys(fileUpdates).forEach(filename => {
        
        const objToWrite = shouldSort 
            ? sortObjectByKey(fileUpdates[filename])
            : fileUpdates[filename]

        fs.writeFileSync(
            filename, 
            JSON.stringify(objToWrite, null, 2)
        );

    });

    const timeDiff = process.hrtime(time);
    console.log(`Completed in ${timeDiff[0]}.${parseInt(timeDiff[1] * 1e-6)} seconds`);

}

function getFiles(dir, files_){
    files_ = files_ || [];
    var files = fs.readdirSync(dir);
    for (var i in files){
        var name = path.join(dir, files[i]);
        if (fs.statSync(name).isDirectory()){
            getFiles(name, files_);
        } else {
            files_.push(name);
        }
    }
    return files_;
}

function sortObjectByKey(unordered) {
    
    const ordered = {};
    Object.keys(unordered).sort().forEach(function(key) {
        ordered[key] = unordered[key];
    });

    return ordered;
}