const { opAWSRestore } = require('../operations/op-aws-backup-restore');

/**
 * Part of the AWS Backup steps to restore a table. Carry out the steps to
 * restore a table from AWS Backups
 *
 * @param   {Object} ops - configuration object with all operation settings
 * @returns {Object} returns an updated ops configuration object with newly added
 *                   restoreAWS item added and updated.
 *
 */
async function performRestoreAWS(ops, chosenTable, chosenBackup) {
  // No operations imported for this process as ops.backupDynamoDupe
  // comes from the AWS Backup steps.
  try {
    // Set the restoreAWS operation coming from AWS Backups steps
    ops.restoreAWS.backupObj = chosenBackup;
    ops.restoreAWS.targetTable = chosenTable;
    ops.restoreAWS.message = `\n🔄 RESTORING [${chosenTable}] from backup...`;

    // Start the restore process
    ops.restoreAWS = await opAWSRestore(ops.restoreAWS);
  } catch (error) {
    ops.restoreAWS.opStatus = 'failed';
    ops.restoreAWS.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performRestoreAWS };
