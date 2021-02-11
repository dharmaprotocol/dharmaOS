const fs = require("fs");
const path = require("path");
const ethers = require("hardhat").ethers;
const YAML = require("yaml");
const { Validator } = require("./Validator");
const { evaluate } = require("./evaluate");

const generateSinglePassingTest = async (
    actionScriptName,
    variables,
    actionScriptTestName = null
) => {
    const blockNumber = await ethers.provider.getBlockNumber();

    let testName = actionScriptTestName;
    if (testName === null) {
        const { summary } = await Validator.getActionScript(actionScriptName);
        testName = summary;
    }

    console.log(`Generating single test for ${actionScriptName}: ${testName}`);

    const { success, results, events } = await evaluate(
        actionScriptName,
        variables,
        blockNumber
    );

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

const createSinglePassingTestAndWrite = async (
    category,
    actionScriptName,
    variables
) => {
    const testYAML = await generateSinglePassingTest(
        actionScriptName,
        variables
    );
    console.log(testYAML);

    await writeTestToFile(actionScriptName, testYAML, category);
    console.log(`Created test: ${category}/${actionScriptName}.yaml`);

    process.exit(0);
};

const main = async () => {
    await createSinglePassingTestAndWrite("compound", "DEPOSIT_TO_COMPOUND", {
        suppliedTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        suppliedAmount: "1000000000",
        cTokenAddress: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
    });
};

main();
