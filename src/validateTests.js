const { TestValidator } = require('./TestValidator');

const validateTests = async () => {
	const scenarios = await TestValidator.call();
	console.log(`Validated ${scenarios.length} action script tests.`);
}

validateTests();