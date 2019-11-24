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

    console.log(`Starting csv to json operation. CSV: ${sourceFilePath}, JSON files in: ${destPath}`);

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
    const destination = getFiles(destPath);

    // check if there are any dest files
    if(destination.length == 0) {
        console.error('There are no files in dest directory', destPath);
        return 1;
    }

    console.debug(`Found ${destination.length + 1} files in dest dir`);

    // extract language names from dest file names
    destination = destination.map(x => {
        return {
            lang: path.basename(x, path.extname(x)),
            filename: x
        }
    });

    // extract unique languages in dest dir
    const languagesInFiles = [...new Set(destination.map(x => x.lang))].sort();

    console.debug(`Found ${languagesInFiles.join(', ')} files in destination dir`);

    const languagesInSource = [];

    // read and parse csv source file
    const records = csvParse(fs.readFileSync(sourceFilePath), {
        columns: (headerRow) => {
            languagesInSource = headerRow.slice(1).sort();
            return languagesInSource.map(x => x.toLowerCase());
        }
    });

    console.debug(`Found ${languagesInSource.join(', ')} languages in csv`);
    console.debug(`Found ${records.length + 1} keys in csv`);

    // check if the languages matches between source and destination
    if(JSON.stringify(languagesInFiles) !== JSON.stringify(languagesInSource)) {
        console.error(`Languages mismatch`);
        return 1;
    }

    // read and parse all destination json files
    destination = destination.map(x => {
        x.contents = JSON.parse(fs.readFileSync(x.filename));
        return x;
    });

    // flatten and fill with meta data about keys
    destination = destination.flatMap((df, i, a) => {
        
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
            return {
                keyInFile: k,
                effectiveKey: `${prefix}${k}`,
                lang: df.lang,
                filename: df.filename,
                value: df.contents[k]
            }

        });
    });

    const numDistinctKeysInDest = ((destination.length + 1) / languagesInFiles);
    console.debug(`Found ${numDistinctKeysInDest} keys in dest files`);

    if(numDistinctKeysInDest != records.length + 1) {
        console.error("Keys mismatch");
        return 1;
    }

    // foreach source record and foreach its lang find corresponding object in destination and set its value
    records.forEach(x => {
        languagesInSource.forEach(l => {
            // updateTargets[l][x.key].value = x[l];

            destination
                .filter(d => d.effectiveKey == x.key && d.lang == l)
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
        
        fs.writeFileSync(
            filename, 
            ar.sort 
                ? sortObjectByKey(fileUpdates[filename])
                : fileUpdates[filename]
        );

    });

    const timeDiff = process.hrtime(time);
    console.log(`Completed in ${timeDiff[0]} seconds`);

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