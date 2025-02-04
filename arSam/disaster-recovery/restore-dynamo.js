const {
  activateReadline,
  backToMenuOrExit,
  cleanAndExit,
  confirmRestoreProcess,
  confirmTableName,
  confirmTable,
  getAvailableTables,
  getConsoleInput
} = require('./functions');

// Restore options functions
const { performAWSBackupSteps } = require('./restore-options/perform-aws-backup-steps.js');
const { performDeleteTable } = require('./restore-options/perform-delete-table.js');
const { performBackupOriginal } = require('./restore-options/perform-backup-dynamo-original.js');
const { performManualRestoreAWS } = require('./restore-options/perform-manual-restore-aws.js');
const { performManualRestoreDynamo } = require('./restore-options/perform-manual-restore-dynamo.js');
const { performPitrSteps } = require('./restore-options/perform-pitr-steps.js');
const { performTurnOnPitr } = require('./restore-options/perform-turn-on-pitr.js');
const { performTurnOnDeletionProtection } = require('./restore-options/perform-turn-on-deletion-protection.js');

// Restore processes
const restoreProcesses = {
  BACKUP: performAWSBackupSteps,
  DELETE_TABLE: performDeleteTable,
  MANUAL_BACKUP: performBackupOriginal,
  MANUAL_RESTORE_AWS: performManualRestoreAWS,
  MANUAL_RESTORE_DYNAMO: performManualRestoreDynamo,
  PITR: performPitrSteps,
  TURN_ON_DELETION_PROTECTION: performTurnOnDeletionProtection,
  TURN_ON_PITR: performTurnOnPitr
};

async function mainMenu() {
  let ops = {};
  let tables = await getAvailableTables();

  try {
    let restoreProcess;
    while (!restoreProcess) {
      // Ask the user to select their restore process, should match restoreProcesses
      restoreProcess = await confirmRestoreProcess();

      // If there are no processes selected, back to main menu
      if (!Object.keys(restoreProcesses).includes(restoreProcess)) {
        console.log(`\n🔙 Back to main menu...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        restoreProcess = null;
      }
    }

    // Choose table name.
    // If it's a manual restore, the user is asked to type the table
    let chosenTable;
    if (restoreProcess == 'MANUAL_RESTORE_DYNAMO' || restoreProcess == 'MANUAL_RESTORE_AWS') {
      chosenTable = await confirmTableName(tables);
    } else {
      chosenTable = await confirmTable(tables);
    }

    // Run the process
    ops = await restoreProcesses[restoreProcess](ops, chosenTable);
  } catch (error) {
    // Catch any errors with the processes and initiate cleanup if needed
    console.log('\n❗ Issue while running processes. Checking for things to clean...');

    // Check operations for any failures and show it to the user
    let cleanUp = false;
    for (let op of Object.keys(ops)) {
      if (ops[op].opStatus == 'failed') {
        cleanUp = true;
        console.error('\nFailure during: ', ops[op].operationName);
        console.error('\nError:', ops[op].errorMessage);
      }
    }

    // Clean up any lingering items, e.g. unnecessary backups, tables, etc.
    if (cleanUp) {
      console.log('\n🪣. Cleaning up and exiting...');
      await cleanAndExit(ops);
    }

    // Otherwise there's nothing to clean
    console.log('\n✅ Nothing to clean.');

    // If there's nothing to clean, then there might be an error elsewhere
    // Allow the user to print the stacktrace if they want
    let printStackTrace = await getConsoleInput(`\n🖨. Print the stack trace anyway?`, ['y', 'n']);
    console.log('\n🖨 Stack Trace:\n');

    if (printStackTrace == 'y') {
      console.error(error);
    }
  }

  console.log('\n✨ Reached the end of the process. ✨');
  await backToMenuOrExit();
}

async function run() {
  activateReadline();
  await mainMenu();
}

run();

module.exports = { mainMenu };
