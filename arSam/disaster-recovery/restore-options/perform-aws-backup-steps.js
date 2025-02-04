const {
  backToMenuOrExit,
  confirmAWSBackupChoice,
  getRecoveryPointsAWSBackupsByTable,
  confirmInitiateCleanup,
  wrapQuery
} = require('../functions');

const operations = require('../operations');
const { performBackupOriginal } = require('./perform-backup-dynamo-original');
const { performDeleteTable } = require('./perform-delete-table');
const { backupDynamoOG, deleteOG, restoreAWS } = operations;

const { performRestoreAWS } = require('./perform-restore-aws');

/**
 * Process for performing a full backup using AWS Backup. This function will delete
 * the original table and then restore it from a backup in AWS Backup. It will then
 * enable Point-in-Time recovery and Deletion Protection (those settings are not
 * restored automatically).
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                  contain the operation parameters for their respective operations.
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for an AWS Backup restore
 *
 */
async function performAWSBackupSteps(ops, chosenTable) {
  // Operations required for this process
  ops.backupDynamoOG = backupDynamoOG;
  ops.deleteOG = deleteOG;
  ops.restoreAWS = restoreAWS;

  try {
    // Check that backups exist for the chosen table
    let backups = await getRecoveryPointsAWSBackupsByTable(chosenTable);

    if (backups.length > 0) {
      let chosenBackup = await confirmAWSBackupChoice(chosenTable, backups, false);

      // BACKUP the original table (just in case)
      ops = await performBackupOriginal(ops, chosenTable);

      // DELETE the original table (confirm if Deletion Protection is enabled, confirm again before deleting)
      ops = await performDeleteTable(ops, chosenTable);

      // RESTORE the chosen table from the duplicate backup
      ops = await performRestoreAWS(ops, chosenTable, chosenBackup);

      // Initiate Cleanup
      await confirmInitiateCleanup(ops);
    } else {
      // It may be that a table doesn't have any AWS Backups
      console.log(wrapQuery(`\n❗ Doesn't look like there are any AWS Backups for [${chosenTable}].`));
      await backToMenuOrExit();
    }

    return ops;
  } catch (error) {
    throw error;
  }
}

module.exports = { performAWSBackupSteps };
