const fs = require("fs");

/// builds and stores the entire directory simulator
/// Maps denote directories/subdirectories and you could later use object or strings to 
/// denote actual files
let DIRECTORY = new Map();

/// this acts as a stack that will track where you're currently at
/// empty list will imply root
let DIR_STACK = [];

/// toplevel check
const VALID_COMMANDS = {
    dir: {},
    mkdir: {
        requiresSource: true,
    },
    cd: { requiresSource: true },
    up: {},
    mv: {
        requiresSource: true,
        requiresDestination: true,
    },
    tree: {},
};

/// regex to validate filename
const DIR_REGEX = new RegExp("^[a-zA-Z0-9_]{1,6}$");

/// stores output file name for writer use
/// NOTE: in the current implementation it uses js' fs
/// with many operations its possible that the sync write 
/// does not complete appropriately and can write msgs out of order
let OUTPUT_FILE_NAME = "";

/// helper var to track if the first line has been written
/// if true, then we'll write a newline so it structures the output
/// file properly
let ADD_NEW_LINES = false;

const main = () => {
    let inputFileName = "";
    let outputFileName = "";

    // 3rd arg is input file name
    if (process.argv.length > 2) {
        inputFileName = process.argv[2];
    }

    if (!fs.existsSync(inputFileName)) {
        console.error("Input file does not exist");
        return;
    }

    // 4th arg is output file name
    if (process.argv.length > 3) {
        outputFileName = process.argv[3];
    }

    let jobId = Date.now(); //also acts as start time for timer

    // if no output file provided
    if (outputFileName.length == 0) {
        outputFileName = `output_${jobId}.txt`;
    }

    console.log(`~~~ starting main for jobId: ${jobId}\n`);
    runMain(inputFileName, outputFileName);

    let endTime = Date.now();
    let elapsed = (endTime - jobId) / 1000;
    console.log(`\n~~~ ending main. Total runtime: ${elapsed}s`);
};

const runMain = (inputFileName, outputFileName) => {
    DIRECTORY.clear();
    createOrPurgeOutputFile(outputFileName);

    // reads input and creates array to run
    const inputs = fs.readFileSync(inputFileName, "utf8").split("\n");

    for (let i = 0; i < inputs.length; i++) {
        let input = inputs[i].trim(); //sanitize input

        // takes the input and builds our own command object that gets validated
        let cmd = buildInputCommand(input);

        // executes the command that was built
        if (cmd["errorMsg"] && cmd["errorMsg"].length > 0) {
            writeToOutputFile(
                `Invalid input: ${cmd["input"]}. Reason: ${cmd["errorMsg"]}`
            );
        } else {
            executeCmd(cmd);
        }
    }
};

/// creates or purges content of output file
const createOrPurgeOutputFile = (outputFileName) => {
    ADD_NEW_LINES = false;
    OUTPUT_FILE_NAME = outputFileName;

    let flags = {};

    // overwrite existing file
    if (fs.existsSync(OUTPUT_FILE_NAME)) {
        flags = { flag: "w" };
    }

    fs.writeFile(OUTPUT_FILE_NAME, "", flags, (err) => {
        if (err) throw err;
    });
};

// fixed length strings (trimmed) commands start w/ first 8 chars as command
// mkdir/cd start a subdir string at ind 9
// mv takes 2 args w/ the first 2 taking 8 chars, destination is currently not restricted
const buildInputCommand = (input) => {
    let cmd = {};

    cmd["input"] = input;
    cmd["action"] = input.substr(0, input.length > 8 ? 8 : input.length).trim();

    // source dir names have a length max of 6, but has a padding of 2, so we'll grab next 8
    cmd["source"] = input.length > 8 ? input.substr(8, 8).trim() : "";

    // destination starts after 8 fixed width action and 8 fixed width source file name (6 maxlength + 2)
    cmd["destination"] = input.length > 16 ? input.substr(16).trim() : "";

    // light validation on fields in the
    cmd["errorMsg"] = validateCommand(cmd);

    return cmd;
};

// validates properties of the command object
const validateCommand = (cmd) => {
    if (!Object.keys(VALID_COMMANDS).includes(cmd["action"])) {
        return "Invalid Command";
    }

    if (
        VALID_COMMANDS[cmd["action"]].requiresSource &&
        cmd["source"] === undefined
    ) {
        return "Invalid additional parameters";
    }

    if (
        VALID_COMMANDS[cmd["action"]].requiresSource &&
        cmd["source"] &&
        !DIR_REGEX.test(cmd["source"])
    ) {
        return "Invalid source";
    }

    if (cmd["destination"]) {
        return validateDestination(cmd);
    }

    return "";
};

// i'm not going to think about the nightmare regex, will do this programmatically
const validateDestination = (cmd) => {
    let returnStr = "";

    if (
        cmd["destination"].startsWith("\\") ||
        cmd["destination"].endsWith("\\")
    ) {
        returnStr = "Invalid destination";
    }

    let strArr = cmd["destination"].split("\\");
    strArr.forEach((str) => {
        if (str !== "." && str !== ".." && !DIR_REGEX.test(str)) {
            returnStr = "Invalid destination";
        }
    });

    return returnStr;
};

// if validation failed, we'll
const executeCmd = (cmd) => {
    // echo command
    let cmdStr = buildCmdStr(cmd);
    writeToOutputFile(cmdStr);

    // based on action we'll go to one of these subroutines to execute their logic
    switch (cmd["action"]) {
        case "dir":
            executeDir(cmd);
            break;
        case "mkdir":
            executeMkdir(cmd);
            break;
        case "cd":
            executeCd(cmd);
            break;
        case "up":
            executeUp();
            break;
        case "mv":
            executeMv(cmd);
            break;
        case "tree":
            executeTree();
            break;
        default:
            writeToOutputFile(`Invalid input: ${cmd["input"]}`);
            break;
    }
};

// builds the command echo
const buildCmdStr = (cmd) => {
    let cmdStr = `Command: `;
    let padAction = cmd["source"] ? 8 : 0;
    cmdStr += `${cmd["action"]}`.padEnd(padAction, " ");

    let padSource = cmd["destination"] ? 8 : 0;
    cmdStr += `${cmd["source"]}`.padEnd(padSource, " ");

    cmdStr += `${cmd["destination"] || ""}`;

    return cmdStr;
};

//#region execute commands

/// executeDir takes your current directory and prints its subdirs
const executeDir = () => {
    let getCurrentDir = getCurrentDirectory();

    let path = getCurrentDir[0];
    let currentDir = getCurrentDir[1];

    writeToOutputFile(`Directory of ${path}:`);

    if ([...currentDir.keys()].length) {
        let keys = [...currentDir.keys()].sort();
        let keyStr = "";

        for (let i = 0; i < keys.length; i++) {
            if (i > 0 && i % 10 == 0) {
                keyStr += "\n";
            }

            keyStr += `${keys[i].substr(0, 8)}`.padEnd(8, " ");
        }

        writeToOutputFile(keyStr);
    } else {
        writeToOutputFile(`No subdirectories`);
    }
};

const executeMkdir = (cmd) => {
    if (!addToDirectory(cmd["source"])) {
        writeToOutputFile(`Subdirectory already exists`);
    }
};

const executeUp = () => {
    if (DIR_STACK.length > 0) {
        DIR_STACK.pop();
    } else {
        writeToOutputFile(`Cannot move up from root directory`);
    }
};

const executeCd = (cmd) => {
    let getCurrentDir = getCurrentDirectory();

    let currentDir = getCurrentDir[1];

    if (currentDir.has(cmd["source"])) {
        DIR_STACK.push(cmd["source"]);
    } else {
        writeToOutputFile(`Subdirectory does not exist`);
    }
};

const executeMv = (cmd) => {
    // check if subdir exists in our current dir
    let getCurrentDir = getCurrentDirectory();

    if (!getCurrentDir[1].has(cmd["source"])) {
        writeToOutputFile(`Subdirectory does not exist`);
        return;
    }

    // check if destination exists by checking the destination and building
    // its own stack
    let res = traverseDirectories(cmd, getCurrentDir);

    if (res && res !== undefined) {
        if (res[0].length > 0) {
            writeToOutputFile(res[0]);
            return;
        } else if (res[1].length > 0) {
            applyMv(cmd, res[1]);
        }
    }
};

const executeTree = () => {
    let currentDir = getCurrentDirectory();

    let currentDirContents = currentDir[1];

    writeToOutputFile(`Tree of ${currentDir[0]}:`);
    writeToOutputFile(".");

    if ([...currentDirContents.keys()].length) {
        writeToOutputFile(buildTree([], currentDirContents, "").join("\n"));
    }
};

//#endregion

/// buildTree will iterate the stack belonging to the current directory and then
/// use DP to drill in.
/// msgArr stores the messages that need to be printed
/// currentDir is the map of the currentDir
/// depth should start as an empty string "". DP will build the depth string by adding
/// indentation as it drills down
/// ├,└,─,│
const buildTree = (msgArr, currentDir, depth) => {
    let keys = [...currentDir.keys()].sort();

    for (let i = 0; i < keys.length; i++) {
        let dirName = keys[i];
        let isLast = i === keys.length - 1;
        let msg = `${depth}${isLast ? `└── ` : `├── `}${dirName}`;

        msgArr.push(msg);

        let subDir = currentDir.get(dirName);
        if (subDir !== undefined && [...subDir.keys()].length > 0) {
            const subDepth = depth + (isLast ? "    " : "│   ");
            msgArr.concat(buildTree(msgArr, subDir, subDepth));
        }
    }

    return msgArr;
};

/// traverseDirectories will check `destination` to see if it is a valid action
/// this will iterate through each part of the destination
const traverseDirectories = (cmd, sourceDirectory) => {
    let dirStackCopy = [...DIR_STACK];
    let destinationArr = cmd["destination"].split("\\");
    let returnStr = "";
    let currentDir = undefined;

    for (let i = 0; i < destinationArr.length; i++) {
        let dest = destinationArr[i];

        // if . then use current directory
        // if .. then pop dirStackCopy
        // if dir, then check dir exists in current directory

        if (dest == "..") {
            if (dirStackCopy.length == 0) {
                returnStr = "Cannot move up from root directory";
                break;
            } else {
                dirStackCopy.pop(); // removes the last directory from our stack
            }
        } else if (dest != ".") {
            let getCurrentDir = getCurrentDirectory(dirStackCopy);

            let localPath = getCurrentDir[0];

            // ensure we're not back in the same directory and trying to move an illegal folder
            if (localPath === sourceDirectory[0] && cmd["source"] === dest) {
                returnStr = "Illegal action attempted";
                break;
            } else {
                currentDir = getCurrentDir[1];
                if (currentDir.has(dest)) {
                    let newDirCheck = currentDir.get(dest);

                    // if this is the last, then we can check source
                    if (
                        i === destinationArr.length - 1 &&
                        newDirCheck.has(cmd["source"])
                    ) {
                        returnStr = "Subdirectory already exists";
                        break;
                    } else {
                        // if its the final destination, then add to stack and create later
                        dirStackCopy.push(dest);
                    }
                } else {
                    // if this is the last, then we may be intending on moving and renaming
                    if (i === destinationArr.length - 1) {
                        dirStackCopy.push(dest);
                    } else {
                        returnStr = "Subdirectory does not exist";
                        break;
                    }
                }
            }
        }
    }

    return [returnStr, dirStackCopy]; // if this is NOT empty, then we've got a problem
};

const applyMv = (cmd, stack) => {
    // either return everything nested or we return a new map
    let dirContents = getCurrentDirectory(undefined, cmd["source"], true);

    addToDirectory(cmd["source"], stack, dirContents[2], true);
};

/// getCurrentDirectory rebuilds the current directory based on the stack
/// an empty stack implies `root`
/// can also take a stack parameter to check that stack
/// stack is a custom stack
/// srcDir is the name of the dir we want to extract
/// remove will delete srcDir from its current directory
/// returns [path: str, subdir: Map, contents: Map]
const getCurrentDirectory = (stack, srcDir, remove) => {
    let path = "root";
    let retVal = new Map();
    let subdir = DIRECTORY;

    let dirStack = stack ?? DIR_STACK;

    dirStack.forEach((dir) => {
        path += `\\${dir}`;

        subdir = subdir.get(dir);
    });

    if (subdir !== undefined && subdir.has(srcDir)) {
        retVal = subdir.get(srcDir) ?? new Map();
        if (remove) {
            subdir.delete(srcDir);
        }
    }

    return [path, subdir, retVal];
};

/// addToDirectory will take a newPath and add it to the dirstack/stack
/// if stack, map, or rename are put in then we'll rename the path to the last
/// item in the arr
/// this satisfies command series like mkdir sub3, mkdir sub4, mv sub4 sub6
const addToDirectory = (newPath, stack, map, rename) => {
    let subdir = DIRECTORY;

    let dirStack = stack ?? DIR_STACK;

    for (let i = 0; i < dirStack.length; i++) {
        let dir = dirStack[i];

        if (subdir.has(dir)) {
            subdir = subdir.get(dir);
        } else if (i === dirStack.length - 1 && rename) {
            // last and rename, so we're going to set the newPath to this name
            newPath = dir;
        }
    }

    if (subdir !== undefined && !subdir.has(newPath)) {
        subdir.set(newPath, map ?? new Map());
        return true;
    } else {
        return false;
    }
};

/// prints string to console and writes to output file
const writeToOutputFile = (str) => {
    console.log(str);

    // subsequent writes will add a newline before writing
    if (ADD_NEW_LINES) {
        str = `\n${str}`;
    } else {
        ADD_NEW_LINES = true;
    }

    fs.appendFileSync(OUTPUT_FILE_NAME, str);
};

main();
