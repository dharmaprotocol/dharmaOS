const { TestValidator } = require('./TestValidator');

const validateTests = async () => {
	const all = await TestValidator.call();
	console.log(`Validated ${all.length} action script tests.`);
}

validateTests();