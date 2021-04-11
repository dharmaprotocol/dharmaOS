if (
	typeof process.env.CI_THREAD !== "undefined" && (
		process.env.CI_THREAD === "1" && !process.version.startsWith("v15")
	)
) {
	console.log("Skipping thread 1 tests for < v15!");
} else if (
	typeof process.env.CI_THREAD === "undefined" || (
		process.env.CI_THREAD === "1" && process.version.startsWith("v15")
	)
) {
	require("../src/test-template")(1);
}