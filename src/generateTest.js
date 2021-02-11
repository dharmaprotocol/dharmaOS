const ethers = require("hardhat").ethers;
const YAML = require('yaml');
const { Validator } = require("./Validator");
const { evaluate } = require("./evaluate");

const generateSinglePassingTest = async (actionScriptName, variables, actionScriptTestName = null) => {
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

    const test = YAML.stringify({
    	name: actionScriptName,
    	blockNumber,
    	tests: [{
    		name: testName,
    		success: true,
    		variables,
    		results,
    		events,
    	}],
    });

    console.log(test);
}

generateSinglePassingTest(
	"DEPOSIT_ETH_TO_COMPOUND",
	{
		suppliedETHAmount: ethers.utils.parseEther("1").toString(),
	}
);