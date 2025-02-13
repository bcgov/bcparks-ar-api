const { opDynamoBackup } = require('../operations/op-dynamo-backup');

/**
 * Part of the PITR steps to restore a table. Initiates the process for backing up
 * the duplicate table in DynamoDB.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific backupDynamoDupe action.
 *
 */
async function performBackupDuplicate(ops) {
  // No operations imported for this process as ops.backupDynamoDupe
  // comes from the PITR steps.
  try {
    // Set the backupDynamoDupe operation coming from PITR steps
    ops.backupDynamoDupe.sourceTable = ops.duplicate.targetTable;
    ops.backupDynamoDupe.backupName = ops.duplicate.targetTable;
    ops.backupDynamoDupe.message = `\n💾  BACKING UP duplicate as [${ops.backupDynamoDupe.backupName}]...`;

    // Start the backup process
    ops.backupDynamoDupe = await opDynamoBackup(ops.backupDynamoDupe);
  } catch (error) {
    ops.backupDynamoDupe.opStatus = 'failed';
    ops.backupDynamoDupe.errorMessage = error;
    throw error;
  }

  return ops;
}

module.exports = { performBackupDuplicate };
