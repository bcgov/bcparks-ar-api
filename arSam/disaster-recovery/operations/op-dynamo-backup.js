const { backupTableOnDemandDynamo, checkAndUpdate } = require('../functions');

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
    backupOp.response = await backupTableOnDemandDynamo(backupOp.sourceTable, backupOp.backupName);

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
