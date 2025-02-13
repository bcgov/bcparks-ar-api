const { awsCommand, checkAndUpdate } = require('../functions');

/**
 * Executes the operation for enabling PITR for a table in DynamoDB.
 *
 * @param   {Object} turnOnPitrOp - operation object containing the AWS operation
 *                  and the parameters for its verification
 * @returns {Object} updated turnOnPitrOp following execution and verification
 *
 */
async function opTurnOnPitr(turnOnPitrOp) {
  try {
    process.stdout.write(turnOnPitrOp.message);
    turnOnPitrOp.response = await awsCommand([
      'dynamodb',
      'update-continuous-backups',
      '--table-name',
      turnOnPitrOp.targetTable,
      '--point-in-time-recovery-specification',
      'PointInTimeRecoveryEnabled=true'
    ]);
    turnOnPitrOp.args = [turnOnPitrOp.targetTable, true];

    await checkAndUpdate(turnOnPitrOp);
  } catch (error) {
    turnOnPitrOp.opStatus = 'failed';
    turnOnPitrOp.errorMessage = error;
    throw error;
  }

  return turnOnPitrOp;
}

module.exports = { opTurnOnPitr };
