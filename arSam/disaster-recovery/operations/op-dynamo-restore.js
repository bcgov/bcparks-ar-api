const { awsCommand, checkAndUpdate } = require('../functions');

/**
 * Executes the operation for restoring a table from DynamoDB Backups.
 *
 * @param   {Object} restoreDynamoOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated restoreDynamoOp following execution and verification
 *
 */
async function opDynamoRestore(restoreDynamoOp) {
  try {
    process.stdout.write(restoreDynamoOp.message);

    // Pull all backups in DynamoDB, get the ARN for the one that matches restoreDynamoOp.backupName
    let backups = await awsCommand(['dynamodb', 'list-backups']);
    let backup = backups.BackupSummaries.find((item) => item.BackupName == restoreDynamoOp.backupName);
    let backupArn = backup.BackupArn;

    restoreDynamoOp.response = await awsCommand([
      'dynamodb',
      'restore-table-from-backup',
      '--target-table-name',
      restoreDynamoOp.targetTable,
      '--backup-arn',
      backupArn
    ]);

    // Verify that the restored table now exists, check should return true
    restoreDynamoOp.args = [restoreDynamoOp.targetTable, true];

    await checkAndUpdate(restoreDynamoOp);
  } catch (error) {
    restoreDynamoOp.opStatus = 'failed';
    restoreDynamoOp.errorMessage = error;
    throw error;
  }

  return restoreDynamoOp;
}

module.exports = { opDynamoRestore };
