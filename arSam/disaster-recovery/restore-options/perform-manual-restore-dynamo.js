const { awsCommand, backToMenuOrExit, confirmDynamoBackupChoice, wrapQuery } = require('../functions');

const { opDynamoRestore } = require('../operations/op-dynamo-restore');

const operations = require('../operations');
const { restoreDynamo } = operations;

/**
 * Carry out the steps to restore a table from DynamoDB Backups
 *
 * @param   {Object} ops - configuration object with all operation settings
 * @returns {Object} returns an updated ops configuration object with newly added
 *                   restoreDynamo item added and updated.
 *
 */
async function performManualRestoreDynamo(ops, chosenTable) {
  // Operation required for this process
  ops.restoreDynamo = restoreDynamo;

  try {
    // Restore process can continue
    // Check that backups exist for the chosen table
    let backups = await awsCommand(['dynamodb', 'list-backups', '--table-name', chosenTable]);

    // Perform steps for DynamoDB Backup if there are backups
    if (backups.BackupSummaries.length > 0) {
      let backupName = await confirmDynamoBackupChoice(chosenTable, backups.BackupSummaries);

      // Set the restoreDynamo operation
      ops.restoreDynamo.backupName = backupName.BackupName;
      ops.restoreDynamo.targetTable = chosenTable;
      ops.restoreDynamo.message = `\n🔄 RESTORING [${chosenTable}] from backup...`;

      // Start the restore process
      ops.restoreDynamo = await opDynamoRestore(ops.restoreDynamo);
    } else {
      // No tables means we need to go back to the main menu
      console.log(
        wrapQuery(
          `\n❗ Doesn't look like there are any backups for [${chosenTable}] in DynamoDB. You can look for backups in AWS Backups from the main menu.`
        )
      );
      await backToMenuOrExit();
    }
  } catch (error) {
    ops.restoreDynamo.opStatus = 'failed';
    ops.restoreDynamo.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performManualRestoreDynamo };
