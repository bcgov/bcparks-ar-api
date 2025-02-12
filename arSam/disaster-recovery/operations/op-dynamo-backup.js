const { awsCommand, checkAndUpdate } = require('../functions');

/**
 * Executes the operation for backing up a table in DynamoDB Backups.
 *
 * @param   {Object} backupOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated backupOp following execution and verification
 *
 */
async function opDynamoBackup(backupOp) {
  try {
    process.stdout.write(backupOp.message);
    let backup = await awsCommand([
      'dynamodb',
      'create-backup',
      '--table-name',
      backupOp.sourceTable,
      '--backup-name',
      backupOp.backupName
    ]);
    backupOp.response = backup.BackupDetails;

    // Verify that the source table has a backup with the backup's name
    backupOp.args = [backupOp.sourceTable, backupOp.backupName];

    await checkAndUpdate(backupOp);
  } catch (error) {
    backupOp.opStatus = 'failed';
    backupOp.errorMessage = error;
    throw error;
  }

  return backupOp;
}

module.exports = { opDynamoBackup };
