const {
  cleanAndExit,
  confirmToContinueYesNo,
  describeTable,
  removeDeletionProtection,
  getConsoleInput
} = require('../functions');

const { opDeleteTable } = require('../operations/op-delete-table');

const operations = require('../operations');
const { deleteOG } = operations;

async function performDeleteTable(ops, chosenTable) {
  // Operation required for this process
  ops.deleteOG = deleteOG;

  try {
    // Set the deleteOG operation
    ops.deleteOG.sourceTable = chosenTable;
    ops.deleteOG.message = `\n🗑  DELETING [${ops.deleteOG.sourceTable}] table...`;

    // Before deleting, check if Deletion Protection exists
    let checkTable = await describeTable(ops.deleteOG.sourceTable);
    let deletionProtection = checkTable.DeletionProtectionEnabled;

    // CONFIRM
    // Deletion Protection exists, ask to remove it or clean up and exit
    if (deletionProtection) {
      while (true) {
        let confirmedRemoveDelPro = await confirmToContinueYesNo(
          `\n❗ Looks like there's Deletion Protection for [${deleteOG.sourceTable}] - would you like to remove this and continue with the recovery process?`,
          ['y', 'n'],
          removeDeletionProtection,
          [deleteOG.sourceTable]
        );

        // If confirmedRemoveDelPro comes back false, then they want to exit.
        // Double check that's the case.
        if (!confirmedRemoveDelPro) {
          let confirmedExit = await getConsoleInput(`\n🪣. Exit process and initiate clean up?`, ['y', 'n']);

          if (confirmedExit == 'y') {
            await cleanAndExit(ops);
          }
        } else {
          // Deletion Protection is removed and confirmed by user, break out of loop.
          break;
        }
      }
    }

    // CONFIRM
    // Double check with user that they want to delete this table, or clean up and exit
    while (true) {
      let confirmDeleteTable = await confirmToContinueYesNo(
        `\n❗ Confirm DELETION of the table [${deleteOG.sourceTable}] and continue?`,
        ['y', 'n']
      );

      // If confirmDeleteTable comes back false, then they want to exit.
      // Double check that's the case.
      if (!confirmDeleteTable) {
        let confirmedExit = await getConsoleInput(`\n🪣. Exit process and initiate clean up?`, ['y', 'n']);

        if (confirmedExit == 'y') {
          await cleanAndExit(ops);
        }
      } else {
        // Deletion Protection is removed and confirmed by user, break out of loop.
        break;
      }
    }

    // Start the delete process
    ops.deleteOG = await opDeleteTable(ops.deleteOG, ops);
  } catch (error) {
    ops.deleteOG.opStatus = 'failed';
    ops.deleteOG.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performDeleteTable };
