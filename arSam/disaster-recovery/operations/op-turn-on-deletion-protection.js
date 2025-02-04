const { checkAndUpdate, enableDeletionProtection } = require('../functions');

/**
 * Executes the operation for enabling Deletion Protection for a table in DynamoDB.
 *
 * @param   {Object} turnOnDelProOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated turnOnDelProOp following execution and verification
 *
 */
async function opTurnOnDeletionProtection(turnOnDelProOp) {
  try {
    process.stdout.write(turnOnDelProOp.message);
    turnOnDelProOp.response = await enableDeletionProtection(turnOnDelProOp.targetTable);

    // Verify that Deletion Protection is enabled for the table, check should return true
    turnOnDelProOp.args = [turnOnDelProOp.targetTable, true];

    await checkAndUpdate(turnOnDelProOp);
  } catch (error) {
    turnOnDelProOp.opStatus = 'failed';
    turnOnDelProOp.errorMessage = error;
    throw error;
  }

  return turnOnDelProOp;
}

module.exports = { opTurnOnDeletionProtection };
