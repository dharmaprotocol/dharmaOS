const { expect } = require("chai");
const { evaluate } = require("./evaluate");
const { TestValidator } = require("./test-validator");

const THREADS = 4;

const testScenario = async (scenario) => {
    let evaluatedSuccess;
    let evaluatedResults;
    let evaluatedEvents;
    let wallet;

    const {
        actionScriptName,
        testName,
        variables,
        blockNumber,
        success: expectedSuccess,
        results: expectedResults = {},
        events: expectedEvents = [],
    } = scenario;

    describe(`${actionScriptName}: ${testName}`, async function () {
        this.timeout(100000);
        before(async function () {
            const data = await evaluate(
                actionScriptName,
                variables,
                blockNumber
            );

            evaluatedSuccess = data.success;
            evaluatedResults = data.results;
            evaluatedEvents = data.events;
            wallet = data.wallet;
            // console.log(` ---> ${actionScriptName}: ${!!data.success ? 'ready' : 'FAILED'}`)
        });

        it(`expect success to be ${expectedSuccess}`, async function () {
            expect(evaluatedSuccess).to.equal(expectedSuccess);
        });

        for (const [resultName, resultValue] of Object.entries(
            expectedResults
        )) {
            it(`expect result ${resultName} to equal ${resultValue}`, async function () {
                expect(evaluatedResults[resultName]).to.equal(resultValue);
            });
        }

        it(`expect events length to be ${expectedEvents.length}`, async function () {
            expect(evaluatedEvents.length).to.equal(expectedEvents.length);
        });

        for (const [
            i,
            {
                address: expectedAddress,
                name: expectedName,
                args: expectedArgs,
            },
        ] of Object.entries(expectedEvents)) {
            it(`expect event address to be ${expectedAddress}`, async function () {
                const { address: evaluatedAddress } = evaluatedEvents[i];

                expect(evaluatedAddress).to.equal(expectedAddress);
            });

            it(`expect event name to be ${expectedName}`, async function () {
                const { name: evaluatedName } = evaluatedEvents[i];

                expect(evaluatedName).to.equal(expectedName);
            });

            for (let [expectedArgName, expectedArgValue] of Object.entries(
                expectedArgs
            )) {
                it(`expect event arg ${expectedArgName} to be ${expectedArgValue}`, async function () {
                    const { args: evaluatedArgs } = evaluatedEvents[i];
                    if (evaluatedArgs[expectedArgName] === wallet) {
                        expect("wallet").to.equal(
                            expectedArgValue
                        );
                    } else {
                        // Note: values that are dependent on timestamps can
                        // cause issues — look into methods for locking in a
                        // specific timestamp immediately prior to executing
                        // the call being tested
                        if (expectedArgValue !== 'SKIP') {
                            expect(evaluatedArgs[expectedArgName]).to.equal(
                                expectedArgValue
                            );
                        }
                    }
                });
            }
        }
    });
};

const runTests = async (thread) => {
    const scenarios = TestValidator.call();
    const threadedSplitScenarios = [...Array(THREADS).keys()].map(
        t => Object.entries(scenarios)
            .filter(([index, ]) => (index % THREADS === t))
            .map(entries => entries[1])
    );
    const splitScenarios = threadedSplitScenarios[thread];

    if (thread === 0) {
        console.log(
            `Running ${scenarios.length} action script scenario tests across ${THREADS} threads.`
        );
        console.log()
        for (t of [...Array(THREADS).keys()]) {
            if (
                typeof process.env.CI_THREAD !== 'undefined' &&
                process.env.CI_THREAD !== thread
            ) {
                continue;
            }

            console.log(
                `Thread ${t + 1}, ${threadedSplitScenarios[t].length} scenarios:`
            );

            for (const {actionScriptName, testName} of threadedSplitScenarios[t]) {
                console.log(` * ${actionScriptName} => ${testName}`);
            }
            console.log()
        }
        console.log()
    }

    await Promise.all(splitScenarios.map(testScenario));
};

module.exports = runTests;