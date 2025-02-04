const { checkAndUpdate, restoreFromDynamoBackup } = require('../functions');

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
    restoreDynamoOp.response = await restoreFromDynamoBackup(restoreDynamoOp.targetTable, restoreDynamoOp.backupName);

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
