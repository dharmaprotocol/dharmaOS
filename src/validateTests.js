const { TestValidator } = require("./test-validator");

const validateTests = async () => {
    const scenarios = TestValidator.call();
    console.log(`Validated ${scenarios.length} action script tests.`);
};

validateTests();
