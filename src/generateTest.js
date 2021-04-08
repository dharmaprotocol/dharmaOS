const fs = require("fs");
const path = require("path");
const ethers = require("hardhat").ethers;
const YAML = require("yaml");
const inquirer = require("inquirer");
const { Importer } = require("./importer");
const { Validator } = require("./validator");
const { TestValidator } = require("./test-validator");
const { evaluate } = require("./evaluate");

const generateSinglePassingTest = async ({
    actionScriptName,
    variables,
    actionScriptTestName = null,
    blockNumber = null,
}) => {
    if (!blockNumber) {
        blockNumber = await ethers.provider.getBlockNumber();
    }

    let testName = actionScriptTestName;
    if (testName === null) {
        const { summary } = await Importer.getActionScript(actionScriptName);
        testName = summary;
    }

    console.log(`Generating single test for ${actionScriptName}: ${testName}`);

    const {
        success,
        results,
        events,
        parsedReturnData,
        revertReason
    } = await evaluate(
        actionScriptName,
        variables,
        blockNumber
    );

    if (!success) {
        console.error("Test failed!");
        console.error({ results, revertReason, callResults: JSON.stringify(parsedReturnData, null, 2) });
        process.exit(1);
    }

    for (const [i, {args}] of Object.entries(events)) {
        for (const [argName, argValue] of Object.entries(args)) {
            if (argValue === variables.wallet) {
                events[i].args[argName] = "wallet";
            }
        }
    }

    delete variables.wallet;

    return YAML.stringify({
        name: actionScriptName,
        blockNumber,
        tests: [
            {
                name: testName,
                success: true,
                variables,
                results,
                events,
            },
        ],
    });
};

const writeTestToFile = async (actionScriptName, testYAML, category) => {
    const testDir = path.resolve(__dirname, "../action-script-tests");
    try {
        await fs.promises.mkdir(testDir);
    } catch (e) {}

    const categoryDir = path.resolve(testDir, category);
    try {
        await fs.promises.mkdir(categoryDir);
    } catch (e) {}

    fs.writeFileSync(
        path.resolve(categoryDir, `${actionScriptName}.yaml`),
        testYAML,
        "utf8",
        (err) => {
            if (err) {
                console.error(err);
            }
        }
    );
};

const createSinglePassingTestAndWrite = async ({
    category,
    actionScriptName,
    variables,
    blockNumber = null,
}) => {
    const testYAML = await generateSinglePassingTest({
        actionScriptName,
        variables,
        blockNumber,
    });
    console.log(testYAML);

    await writeTestToFile(actionScriptName, testYAML, category);
    console.log(`Created test: action-script-tests/${category}/${actionScriptName}.yaml`);

    process.exit(0);
};

const getInputs = async () => {
    const validator = new Validator();
    await validator.parseActionScripts();
    const actionScriptNames = validator.actionScripts.map(
        (script) => script.name
    );

    const testValidator = new TestValidator();
    testValidator.parseActionScriptTests();
    const actionScriptTestNames = new Set(
        testValidator.actionScriptTests.map((test) => test.name)
    );

    let testGenerationConfig;
    let actionScriptName;
    let variables = {};
    let blockNumber = null;
    try {
        testGenerationConfig = require('../test-generation-config');
        if (!('actionScriptName') in testGenerationConfig) {
            console.error('Error: found test-generation-config.js but no "actionScriptName" property was located.');
            process.exit(1);
        }

        actionScriptName = testGenerationConfig.actionScriptName;

        if (!((new Set(actionScriptNames)).has(actionScriptName))) {
            console.error(`Error: found test-generation-config.js but no matching action script named "${actionScriptName}" was located.`);
            process.exit(1);
        }

        if (!!testGenerationConfig.variables) {
            variables = testGenerationConfig.variables;
        }

        if (!!testGenerationConfig.blockNumber) {
            blockNumber = testGenerationConfig.blockNumber;
        }

        console.log(`Located test-generation-config.js — generating test for ${actionScriptName}.`);
    } catch (error) {
        const actionScriptNameChoices = actionScriptNames.filter(
            (name) => !actionScriptTestNames.has(name)
        );

        if (actionScriptNameChoices.length === 0) {
            console.log(
                `All ${actionScriptNames.length} action scripts already have at least one test!\n\n`,
                `Add more tests to existing action scripts by editing the respective test file directly,`,
                `or move over untested action scripts from the draft-action-scripts directory.`
            );
            process.exit(0);
        }

        const actionScriptNameChoice = await inquirer.prompt([
            {
                type: "list",
                name: "actionScriptName",
                message: "Select an action script without existing tests:",
                choices: actionScriptNameChoices,
            },
        ]);

        actionScriptName = actionScriptNameChoice.actionScriptName;
    }

    const actionScriptIndex = actionScriptNames.indexOf(actionScriptName);
    const actionScriptCategory =
        validator.actionScriptCategories[actionScriptIndex];
    const actionScript = validator.actionScripts[actionScriptIndex];

    const remainingVariables = Object.fromEntries(
        Object.entries(actionScript.variables)
            .filter(([variableName, variableType]) => !(variableName in variables))
    );

    while (Object.keys(remainingVariables).length > 0) {
        const variablesAndLabels = Object.entries(
            remainingVariables
        ).map(([name, type]) => [name, type, `${name} (${type})`]);
        const variableLabels = variablesAndLabels.map((x) => x[2]);

        const variableLabelChoice = await inquirer.prompt([
            {
                type: "list",
                name: "variableLabel",
                message: "Choose a variable to specify:",
                choices: variableLabels,
            },
        ]);
        const variableLabel = variableLabelChoice.variableLabel;
        const variableIndex = variableLabels.indexOf(variableLabel);
        const [variableName, variableType] = variablesAndLabels[
            variableIndex
        ].slice(0, 2);
        delete remainingVariables[variableName];

        const variableChoice = [
            {
                name: variableName,
                message: `Specify a value of type "${variableType}" for "${variableName}":`,
                validate: (input) => {
                    let result = false;
                    try {
                        if (variableType === "address") {
                            try {
                                result = Validator.ensureValidChecksum(input);
                            } catch (e) {}

                            if (!result) {
                                console.log();
                                console.error(
                                    "Invalid checksummed address, try again..."
                                );
                            }
                        } else if (variableType === "bytes") {
                            result =
                                input.startsWith("0x") &&
                                ethers.utils.isHexString(input);
                            if (!result) {
                                console.log();
                                console.error(
                                    "Invalid bytes argument, try again..."
                                );
                            }
                        } else if (
                            variableType.startsWith("bytes") &&
                            !variableType.includes("[")
                        ) {
                            result =
                                input.startsWith("0x") &&
                                ethers.utils.isHexString(input);
                            if (!result) {
                                console.log();
                                console.error(
                                    `Invalid ${variableType} argument, try again...`
                                );
                            }
                        } else if (variableType.startsWith("uint")) {
                            // TODO: check size and sign
                            result =
                                (input.startsWith("0x") &&
                                    input.length < 67 &&
                                    ethers.utils.isHexString(input)) ||
                                (!input.startsWith("0x") &&
                                    ethers.BigNumber.from(input).toString() === input);
                            if (!result) {
                                console.log();
                                console.error(
                                    `Invalid ${variableType} argument, try again...`
                                );
                            }
                        } else if (variableType.startsWith("int")) {
                            // TODO: check size
                            result =
                                (input.startsWith("0x") &&
                                    input.length < 67 &&
                                    ethers.utils.isHexString(input)) ||
                                (!input.startsWith("0x") &&
                                    ethers.BigNumber.from(input).toString() === input);
                            if (!result) {
                                console.log();
                                console.error(
                                    `Invalid ${variableType} argument, try again...`
                                );
                            }
                        } else if (variableType === "bool") {
                            result =
                                input.toLowerCase() === "true" ||
                                input.toLowerCase() === "false" ||
                                input.toLowerCase() === "yes" ||
                                input.toLowerCase() === "no" ||
                                input.toLowerCase() === "t" ||
                                input.toLowerCase() === "f" ||
                                input.toLowerCase() === "y" ||
                                input.toLowerCase() === "n" ||
                                input === "1" ||
                                input === "0" ||
                                input === "0x" + "1".padStart(64, "0") ||
                                input === "0x" + "0".padStart(64, "0") ||
                                input === "0x1" ||
                                input === "0x0" ||
                                input === "0x01" ||
                                input === "0x00";
                            if (!result) {
                                console.log();
                                console.error(
                                    "Invalid boolean argument, try again..."
                                );
                            }
                        } else {
                            console.error("ERROR: unknown type!");
                        }
                    } catch (err) {
                        console.log();
                        console.error("Invalid input, try again...");
                    }
                    return result;
                },
            },
        ];

        let variableValue = (await inquirer.prompt(variableChoice))[variableName];

        if (variableType === 'bool') {
            const truePossibilities = new Set([
                "true", "yes", "t", "y", "1", "0x1", "0x01", "0x" + "1".padStart(64, "0"),
            ]);
            variableValue = (
                variableValue === true ||
                truePossibilities.has(variableValue.toLowerCase())
            );
        }

        variables[variableName] = variableValue;
    }

    return {
        actionScriptName,
        category: actionScriptCategory,
        variables,
        blockNumber,
    };
};

const main = async () => {
    const { actionScriptName, category, variables, blockNumber } = await getInputs();
    await createSinglePassingTestAndWrite({category, actionScriptName, variables, blockNumber});
};

main();
