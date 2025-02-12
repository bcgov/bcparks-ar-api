const { awsCommand, checkAndUpdate } = require('../functions');

const config = require('../config');
const { environment, backupRole } = config;

/**
 * Process for performing a manual DynamoDB Restore for a table
 *
 * @param   {Object} restoreAWS - configuration object containing operation settings
 * @param   {Object} chosenBackup - JSON from AWS with backup information
 * @returns {Object} returns an updated restoreAWS
 *
 */
async function opAWSRestore(restoreAWS) {
  try {
    // RESTORE the original table from the back up
    process.stdout.write(restoreAWS.message);
    restoreAWS.response = await awsCommand([
      'backup',
      'start-restore-job',
      '--recovery-point-arn',
      restoreAWS.backupObj.RecoveryPointArn,
      '--metadata',
      `TargetTableName=${restoreAWS.targetTable}`,
      '--iam-role-arn',
      `arn:aws:iam::${environment}:role/${backupRole}`
    ]);
    restoreAWS.args = [restoreAWS.targetTable, true];

    await checkAndUpdate(restoreAWS);
  } catch (error) {
    restoreAWS.opStatus = 'failed';
    restoreAWS.errorMessage = error;
    throw error;
  }

  return restoreAWS;
}

module.exports = { opAWSRestore };
