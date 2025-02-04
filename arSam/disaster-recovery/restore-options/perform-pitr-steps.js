const {
  backToMenuOrExit,
  confirmPitrDateTime,
  getPitr,
  confirmInitiateCleanup,
  wrapQuery,
  exit
} = require('../functions');

const operations = require('../operations');
const { duplicate, backupDynamoOG, backupDynamoDupe, restoreDynamo, deleteOG, turnOnPitr, turnOnDelPro } = operations;

const { performDuplicateTable } = require('./perform-duplicate-table');
const { performBackupOriginal } = require('./perform-backup-dynamo-original');
const { performBackupDuplicate } = require('./perform-backup-dynamo-duplicate');
const { performDeleteTable } = require('./perform-delete-table');
const { performRestoreDynamo } = require('./perform-restore-dynamo');
const { performTurnOnPitr } = require('./perform-turn-on-pitr');
const { performTurnOnDeletionProtection } = require('./perform-turn-on-deletion-protection');

/**
 * Process for performing a full backup using Point-in-Time Recovery (PITR). This function will
 * duplicate a table, backup the original table and the duplicate, delete the original table and
 * then restore it using the duplicate's backup. It will then delete the duplicate table and
 * enable PITR and Deletion Protection.
 *
 * @param   {Object} ops - operations object containing various AWS operations
 * @param   {String} chosenTable - user selected table
 * @returns {Object} updated ops object containing the result of performing the
 *                   specific actions for a PITR restore
 *
 */
async function performPitrSteps(ops, chosenTable) {
  // Operations required for this process
  ops.duplicate = duplicate;
  ops.backupDynamoOG = backupDynamoOG;
  ops.backupDynamoDupe = backupDynamoDupe;
  ops.restoreDynamo = restoreDynamo;
  ops.deleteOG = deleteOG;
  ops.turnOnPitr = turnOnPitr;
  ops.turnOnDelPro = turnOnDelPro;

  try {
    let pitrBackups = await getPitr(chosenTable);

    if (pitrBackups.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus == 'ENABLED') {
      // User confirms the PITR date/time they're restoring to
      let pitrTime = await confirmPitrDateTime(chosenTable, pitrBackups);

      // DUPLICATE
      ops = await performDuplicateTable(ops, chosenTable, pitrTime);

      // BACKUP the original table (just in case)
      ops = await performBackupOriginal(ops, chosenTable);

      // BACKUP the duplicate table after it's created
      ops = await performBackupDuplicate(ops);

      // DELETE the original table (confirm if Deletion Protection is enabled, confirm again before deleting)
      ops = await performDeleteTable(ops, chosenTable);

      // RESTORE the chosen table from the duplicate backup
      ops = await performRestoreDynamo(ops, chosenTable);

      // TURNING ON Point-in-Time Recovery again
      ops = await performTurnOnPitr(ops, chosenTable);

      // TURNING ON Deletion Protection again
      ops = await performTurnOnDeletionProtection(ops, chosenTable);

      // Initiate Cleanup
      await confirmInitiateCleanup(ops);

      console.log(`\n✨ PTIR restore successful! ✨');`);
    } else {
      // It may be that not all tables have PITR enabled
      console.log(
        wrapQuery(
          `\n❗ Doesn't look like PITR is enabled for [${chosenTable}]. You can enable PITR for a table from the main menu.`
        )
      );
      await backToMenuOrExit();
      exit();
    }
  } catch (error) {
    console.error(error);
    throw error;
  }

  return ops;
}

module.exports = { performPitrSteps };
