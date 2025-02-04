const { backToMenuOrExit, confirmAWSBackupChoice, getRecoveryPointsAWSBackupsByTable } = require('../functions');

const { opAWSRestore } = require('../operations/op-aws-backup-restore');

const operations = require('../operations');
const { restoreAWS } = operations;

/**
 * Carry out the steps to restore a table from AWS Backups
 *
 * @param   {Object} ops - configuration object with all operation settings
 * @returns {Object} returns an updated ops configuration object with newly added
 *                   restoreAWS item added and updated.
 *
 */
async function performManualRestoreAWS(ops, chosenTable) {
  // Operation required for this process
  ops.restoreAWS = restoreAWS;

  try {
    // Check that backups exist for the chosen table
    let backups = await getRecoveryPointsAWSBackupsByTable(chosenTable);

    if (backups.length > 0) {
      let chosenBackup = await confirmAWSBackupChoice(chosenTable, backups, true);

      // Set the restoreAWS operation
      ops.restoreAWS.backupObj = chosenBackup;
      ops.restoreAWS.targetTable = chosenTable;
      ops.restoreAWS.message = `\n🔄 RESTORING [${chosenTable}] from backup...`;

      // Start the restore process
      ops.restoreAWS = await opAWSRestore(ops.restoreAWS);
    } else {
      // It may be that a table doesn't have any AWS Backups
      console.log(
        wrapQuery(
          `\n❗ Doesn't look like there are any backups for [${chosenTable}] in DynamoDB. You can look for backups in AWS Backups from the main menu.`
        )
      );
      await backToMenuOrExit();
    }
  } catch (error) {
    ops.restoreAWS.opStatus = 'failed';
    ops.restoreAWS.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performManualRestoreAWS };
