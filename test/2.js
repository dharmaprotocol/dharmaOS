if (typeof process.env.CI_THREAD === 'undefined' || process.env.CI_THREAD === 2) {
	require("../src/test-template")(2);
}