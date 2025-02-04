const { checkAndUpdate, restoreFromAWSBackup } = require('../functions');

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
    restoreAWS.response = await restoreFromAWSBackup(restoreAWS.targetTable, restoreAWS.backupObj);
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
