const { checkAndUpdate, deleteTable } = require('../functions');

/**
 * Executes the operation for table deletion and verifies the table no longer
 * exists in DynamoDB.
 *
 * @param   {Object} deleteOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated deleteOp following execution and verification
 *
 */
async function opDeleteTable(deleteOp) {
  try {
    process.stdout.write(deleteOp.message);
    deleteOp.response = await deleteTable(deleteOp.sourceTable);
    // Verify that the table no longer exists, check should return false
    deleteOp.args = [deleteOp.sourceTable, false];

    await checkAndUpdate(deleteOp);
  } catch (error) {
    deleteOp.opStatus = 'failed';
    deleteOp.errorMessage = error;
    throw error;
  }

  return deleteOp;
}

module.exports = { opDeleteTable };
