# Disaster Recovery

By default, all production tables in DynamoDB have Point-in-Time Recovery (PITR) enabled and a schedule of AWS Backup snapshots at the start of every month. This means a table can be recreated from any series of backups ranging from any second in the last 35 days (using PITR), to a backup snapshot from 1 year ago (using AWS Backups).

This script assists in recovering a table using PITR or AWS Backups, as well as providing some more fine-grained operations for creating a backup in DynamoDB, restoring from a DynamoDB backup or AWS Backup, deleting a table, and turning on PITR or Deletion Protection for a table in DynamoDB.

## Table of Contents

- [Quick Start](#quick-start)

- [The Disaster Recovery Steps](#the-disaster-recovery-steps)
  - [1. Point-in-Time Recovery Steps](#1-point-in-time-recovery-pitr-steps)
  - [2. AWS Backup Snapshot Steps](#2-aws-backup-snapshot-steps)
- [Table Management](#table-management)
  - [3. Create a Backup in DynamoDB Backups](#3-create-a-backup-in-dynamodb-backups)
  - [4. Restore from DynamoDB Backups](#4-restore-from-dynamodb-backups)
  - [5. Restore from AWS Backup](#5-restore-from-aws-backup)
  - [6. Delete a Table in DynamoDB](#6-delete-a-table-in-dynamodb)
  - [7. Enable Point-in-Time Recovery (PITR)](#7-enable-point-in-time-recovery-pitr)
  - [8. Enable Deletion Protection](#8-enable-deletion-protection)
- [Cleanup](#cleanup)
- [FAQ](#faq)
  - [What is Point in Time Recovery?](#what-is-point-in-time-recovery)
  - [What is AWS Backup?](#what-is-aws-backup)
  - [Why are some backups in DynamoDB Backups and some are in AWS Backup?](#why-are-some-backups-in-dynamodb-backups-and-some-are-in-aws-backup)
  - [What's the difference between warm storage and cold storage?](#whats-the-difference-between-warm-storage-and-cold-storage)
  - [How can I Enable Point in Time Recovery in AWS?](#how-can-i-enable-point-in-time-recovery-in-aws)
  - [What is Deletion Protection?](#what-is-deletion-protection)
  - [How can I Enable Deletion Protection?](#how-can-i-enable-deletion-protection)
  - [Where can I get help in the restore process?](#where-can-i-get-help-in-the-restore-process)

## Quick Start

1. To run the script, navigate to the `arSam/disaster-recovery` directory.

2. Make sure the config values in the `config.js` file match the environment you want to run the script in.

```js
const config = {
  environment: 11111111111,
  timeout: -1, // -1 for no timeout
  vaultName: 'your-vault-name-here',
  backupRole: 'nameOfBackupRole'
};
```

3. Go to _BC Gov AWS login_ portal and login using your IDIR. Select the environment you want to run the script in and select the **Click for Credentials** button to generate your credentials.

4. Paste the token in the terminal to export the credentials.

```
  export AWS_ACCESS_KEY_ID="ABCDEFG"
  export AWS_SECRET_ACCESS_KEY="ABCDEFG/ABCDEFG"
  export AWS_SESSION_TOKEN="ABCDEFG"
  export AWS_DEFAULT_REGION=ca-central-1
  export AWS_REGION=ca-central-1
```

5. In `arSam/disaster-recovery`, run the following command to initiate the disaster recovery steps:

```
  node restore-dynamo.js
```

Choose a recover type and follow the steps outlined in the console.

```
*------------------------------------------------------------------*
|  Disaster Recovery Initiated.                                    |
|                                                                  |
|  Environment: [11111111111]                                      |
|  Vault Name:  [your-vault-name-here]                             |
|  Backup Role: [nameOfBackupRole]                                 |
|                                                                  |
|  Please select a restore option from below.                      |
*------------------------------------------------------------------*

*------------------------*
|  AUTO RESTORE OPTIONS  |
|------------------------------------------------------------------*
|  Option |  Restore Type        |  Description                    |
|------------------------------------------------------------------|
|    1    |     Point-in-Time    | Allows you to choose a date and |
|         |    Recovery (PITR)   | precise time (up to the second) |
|         |                      | to restore the table, from up   |
|         |   est. time: ~20m    | to 35 days ago.                 |
|------------------------------------------------------------------|
|    2    |      AWS Backup      | Allows you to restore a table   |
|         |       Snapshot       | from the last 12 months (this   |
|         |                      | is SIGNIFICANTLY faster if it's |
|         | est. time warm: ~20m | coming from warm storage).      |
|         | est. time cold: ~2h  |                                 |
*----------------------------------------------------------------- *
*------------------------*
|  TABLE MANAGEMENT      |
|------------------------------------------------------------------*
|  Option |  Restore Type        |  Description                    |
|------------------------------------------------------------------|
|    3    |  Create a Backup in  | Build a snapshot of a table and |
|         |   DynamoDB Backups   | store it in DynamoDB Backups.   |
|------------------------------------------------------------------|
|    4    |     Restore from     | Create a new table from a       |
|         |   DynamoDB Backups   | snapshot in DynamoDB Backups    |
|------------------------------------------------------------------|
|    5    |     Restore from     | Create a new table from a       |
|         |      AWS Backup      | snapshot in AWS Backups         |
|------------------------------------------------------------------|
|    6    |    Delete a Table    | Delete a table in DynamoDB.     |
|         |     in DynamoDB      | Check for Deletion Protection.  |
|------------------------------------------------------------------|
|    7    |   Enable Point-in-   | Enable Point-in-Time Recovery   |
|         | Time Recovery (PITR) | for a table.                    |
|------------------------------------------------------------------|
|    8    |   Enable Deletion    | Enable Deletion Protection for  |
|         |      Protection      | a table.                        |
*------------------------------------------------------------------*
```

<br>

> Note: type `help` in the console to receive some information about the disaster recovery steps or some key terms in disaster recovery.

<br>
<br>

## The Disaster Recovery Steps

There are two automated restore options for recovering tables in DynamoDB. These are the Point-in-Time Recovery (PITR) and AWS Backups.

### 1. `Point-in-Time Recovery (PITR) Steps`

_Estimated time to recovery: ~20m_

PITR allows the user to select a specific date and time for a restore, up to the exact second 35 days ago. The table **must already exist** in DynamoDB to initiate a restore.

```
*------------------------*
|  AUTO RESTORE OPTIONS  |
|------------------------------------------------------------------*
|  Choice |  Restore Type        |  Description                    |
|------------------------------------------------------------------|
|    1    |     Point-in-Time    | Allows you to choose a date and |
|         |    Recovery (PITR)   | precise time (up to the second) |
|         |                      | to restore the table, from up   |
|         |     time: ~20m       | to 35 days ago.                 |
*------------------------------------------------------------------*
```

When running the script, select restore option `1` and continue.

Select an existing table to replace with the PITR backup:

```
*---------------------------------*
|  🗂️  CHOOSE A TABLE 🗂️          |
|------------------------------------------------------------------*
|  Table #   |  Table Name                                         |
|------------------------------------------------------------------|
|      1     |  ConfigAr                                           |
|      2     |  NameCacheAr                                        |
|      3     |  ParksAr                                            |
|      4     |  ar-tests                                           |
*------------------------------------------------------------------*

🗂️  Please select a table to continue [1 to 6]
>> 3
```

The script will look for available PITR options for the table:

```
🔍 Looking at the Point-in-Time Recovery options for [ParksAr]...

*-------------------------------*
|  🕑 CHOOSE A RESTORE TIME 🕑  |
|------------------------------------------------------------------*
|  Restorable Time              |  Date and Time                   |
|------------------------------------------------------------------|
|  Earliest restorable time     |  Dec 21 2024 - 12:05:04          |
|  Latest restorable time       |  Jan 23 2025 - 15:14:38          |
*------------------------------------------------------------------*

🕑 How early would you like to restore? LLL dd yyyy - HH:mm:ss
>> Jan 29 2025 - 15:05:04
```

Select a PITR date and time to restore from using the format `LLL dd yyyy - HH:mm:ss`.

The script will outline the steps for the PITR process:

```
*-------------------------------*
| ❗ READ BEFORE CONTINUING ❗  |
|------------------------------------------------------------------*
|  In order to recreate a table from PITR, this script will:       |
|------------------------------------------------------------------|
|  1. DUPLICATE the original table from the desired PITR date/time.|
|  2. BACKUP    the original to DynamoDB as a fallback.            |
|  3. BACKUP    the duplicate table after it's created in Step 1.  |
|  4. DELETE    the original table after it's backed up in Step 2. |
|               > CONFIRM: check if Deletion Protection is enabled.|
|               > CONFIRM: check again before deletion.            |
|  5. RESTORE   the original table from the duplicate backup.      |
|------------------------------------------------------------------|
|  🕑 PITR and Deletion Protection will then be activated again 🔒 |
*------------------------------------------------------------------*

⭐ Confirm you want to restore [ParksAr] to [Jan 28 2025 - 09:39:28]
and continue? [y,n]
>> y
```

The script will then provide status updates during the restore process.

```
📋 DUPLICATING [ParksAr] as [ParksAr--dupe-Jan-28-2025-08-  6m 30s ✅

💾  BACKING UP [ParksAr] as [ParksAr--orig-Jan-28-2025-08-38-5  0s ✅

💾  BACKING UP duplicate as [ParksAr--dupe-Jan-28-2025-08-29-2  0s ✅

❗ Looks like there's Deletion Protection for [ParksAr] - would you
like to remove this and continue with the recovery process? [y,n]
>> y

⏳ Working on it...                                                ✅

❗ Confirm DELETION of the table [ParksAr] and continue? [y,n]
>> y

🗑  DELETING [ParksAr] table...                                 5s ✅

🔄 RESTORING [ParksAr] from backup...                       2m 45s ✅

🕑 TURNING ON PITR for [ParksAr]...                                ✅

🔒 TURNING ON Deletion Protection for [ParksAr]...                 ✅
```

<br>

---

<br>

### 2. `AWS Backup Snapshot Steps`

_Estimated time to recovery from warm storage: 5m - 10m_<br>
_Estimated time to recovery from cold storage: 2h - 4h_

Replaces an existing table with a backup in AWS Backups. The table **must already exist** in DynamoDB to initiate a restore. To restore a table that _no longer exists_ using AWS Backup, you can use [AWS Restore from table management](#5-restore-from-aws-backup).

> Note: AWS Backups are made in 1-month increments and are held in the AWS Backup vault for 1 year. After a backup is created, it's held in **warm storage** for 8 days before being moved to **cold storage**. If restoring from cold storage, expect the process to take upwards of --**two hours**--.

```
*------------------------*
|  AUTO RESTORE OPTIONS  |
|------------------------------------------------------------------|
|    2    |      AWS Backup      | Allows you to choose a snapshot |
|         |       Snapshot       | from the last 12 months (this   |
|         |                      | is SIGNIFICANTLY faster if it's |
|         | time if warm: ~5-10m | coming from warm storage).      |
|         | time if cold: ~2-4h  |                                 |
*----------------------------------------------------------------- *
```

Select an existing table to replace with the backup:

```
*-------------------------------*
|  🗂️  CHOOSE A TABLE 🗂️          |
|------------------------------------------------------------------*
|  Table #   |  Table Name                                         |
|------------------------------------------------------------------|
|      1     |  ConfigAr                                           |
|      2     |  NameCacheAr                                        |
|      3     |  ParksAr                                            |
|      4     |  ar-tests                                           |
*------------------------------------------------------------------*

🗂️_ Please select a table to continue [1,2,3,4,5]
>> 3
```

The script will look for available backups in AWS Backup:

```

🔍 Looking at the AWS Backups for [ParksAr]...

*-------------------------------*
|  💾 CHOOSE A BACKUP 💾        |
|------------------------------------------------------------------*
|  Backup # |  Date         |  Name                     |  Storage |
|------------------------------------------------------------------|
|     1     |  Jan 28 2025  |  ParksAr                  |  Warm 🔥 |
|     2     |  Dec 28 2024  |  ParksAr                  |  Cold ⛄ |
|------------------------------------------------------------------|
| ⛄ Cold storage type takes -SIGNIFICANTLY- longer to restore ⛄  |
*------------------------------------------------------------------*

💾 Which [ParksAr] backup would you like to restore from? [1,2]
>> 1
```

Select a backup option to continue.

The script will outline the steps for the AWS Backup process:

```

*-------------------------------*
| ❗ READ BEFORE CONTINUING ❗  |
|------------------------------------------------------------------*
|  In order to recreate a table from AWS Backup, this script will: |
|------------------------------------------------------------------|
|  1. BACKUP   the original to DynamoDB as a fallback.             |
|  1. DELETE   the original table                                  |
|              > CONFIRM: check if Deletion Protection is enabled. |
|              >CONFIRM: the table again before deletion.          |
|  2. RESTORE  the original from the backup                        |
*------------------------------------------------------------------*

⭐ Confirm you want to restore [ParksAr] from [Jan 28 2025] and
continue? [y,n]
>> y

💾  BACKING UP [ParksAr] as [ParksAr--orig-Jan-29-2025-11-43-5  0s ✅

❗ Confirm DELETION of the table [ParksAr] and continue? [y,n]
>> y

🗑  DELETING [ParksAr] table...                                  5s ✅

🔄 RESTORING [ParksAr] from duplicate...                    2m 25s ✅
```

## Table Management

These are the more fine-grained options you can run to backup, restore, or delete a table in DynamoDB. You can also enable PITR and Deletion Protection with these options.

### 3. `Create a Backup in DynamoDB Backups`

_Estimated time to create backup: 1m - 5m_

Create an instant backup of an existing table in DynamoDB Backups with the name `[tableName]--orig-[LLL-dd-yyyy-HH-mm-ss]`.

```
*------------------------*
|  TABLE MANAGEMENT      |
|------------------------------------------------------------------|
|    3    |  Create a Backup in  | Build a snapshot of a table and |
|         |   DynamoDB Backups   | store it in DynamoDB Backups.   |
*------------------------------------------------------------------*
```

An example of running this process:

```
*------------------------------------------------------------------*
|  Initializing MANUAL BACKUP option...                            |
*------------------------------------------------------------------*

*-------------------------------*
|  🗂️  CHOOSE A TABLE 🗂️        |
|------------------------------------------------------------------*
|  Table #   |  Table Name                                         |
|------------------------------------------------------------------|
|      1     |  ConfigAr                                           |
|      2     |  NameCacheAr                                        |
|      3     |  ParksAr                                            |
|      4     |  ar-tests                                           |
*------------------------------------------------------------------*

🗂️_ Please select a table to continue [1,2,3,4,5]
>> 3

⭐ Confirm to continue with [ParksAr] table? [y,n]
>> y

💾  BACKING UP [ParksAr] as [ParksAr--orig-Jan-29-2025-13-33-2  0s ✅
```

<br>

---

<br>

### 4. `Restore from DynamoDB Backups`

_Estimated time to restore from backup: 10m - 20m_

Restore a table from a backup in **DynamoDB Backups**. The table to be restored must **not exist in DynamoDB currently**. The backup requires a typed-out table name to find available backups matching that table name in DynamoDB Backups.

```
*------------------------*
|  TABLE MANAGEMENT      |
|------------------------------------------------------------------|
|    4    |     Restore from     | Restore a table from a snapshot |
|         |   DynamoDB Backups   | in DynamoDB Backups             |
*------------------------------------------------------------------*
```

An example of running this process:

```
*------------------------------------------------------------------*
|  Initializing RESTORE DYNAMODB BACKUPS option...                 |
*------------------------------------------------------------------*

🖊  Enter the name of the table you'd like to restore. Only tables with matching backup names will be available for selection.
>> ParksAr

⭐ Confirm the table name is [ParksAr]? [y,n]
>> y

⏳ Checking if table name already exists...                        ✅

🔍 Looking at the Dynamo Backups for [ParksAr]...

*-------------------------------*
|  💾 CHOOSE A BACKUP 💾        |
|------------------------------------------------------------------*
|  Backup #  |  Date                    |  Backup Name             |
|------------------------------------------------------------------|
|     1      |  Jan 29 2025 - 12:23:39  |  ParksAr--orig-Jan-29-...|
|     2      |  Jan 29 2025 - 13:33:26  |  ParksAr--orig-Jan-29-...|
*------------------------------------------------------------------*

💾 Which [ParksAr] backup would you like to restore from? [1,2]
>> 1

⭐ Confirm you want to restore [ParksAr] from [Jan 29 2025 -
12:23:39] and continue? [y,n]
>> y

🔄 RESTORING [ParksAr] from backup...                           4s 🕒
```

### 5. `Restore from AWS Backup`

_Estimated time to recovery from warm storage: 10m - 20m_

This restore a table from a backup found in **AWS Backups**. The table to be restored **must not exist in DynamoDB currently**. The backup requires a typed-out table name to find available backups matching that table name in AWS Backups.

> Note: AWS Backups are made in 1-month increments and are held in the AWS Backup vault for 1 year. After a backup is created, it's held in **warm storage** for 8 days before being moved to **cold storage**. If restoring from cold storage, expect the process to take upwards of **two hours**.

```
*------------------------*
|  TABLE MANAGEMENT      |
|------------------------------------------------------------------|
|    5    |     Restore from     | Restore a table from a snapshot |
|         |      AWS Backup      | in AWS Backups                  |
*------------------------------------------------------------------*
```

An example of running this process:

```
*------------------------------------------------------------------*
|  Initializing RESTORE AWS BACKUP option...                       |
*------------------------------------------------------------------*

🖊  Enter the name of the table you'd like to restore. Only tables
with matching backup names will be available for selection.
>> ParksAr

⭐ Confirm the table name is [ParksAr]? [y,n]
>> y

⏳ Checking if table name already exists...                        ✅

🔍 Looking at the AWS Backups for [ParksAr]...

*-------------------------------*
|  💾 CHOOSE A BACKUP 💾        |
|------------------------------------------------------------------*
|  Backup # |  Date         |  Name                     |  Storage |
|------------------------------------------------------------------|
|     1     |  Jan 28 2025  |  ParksAr                  |  Warm 🔥 |
|     2     |  Dec 28 2024  |  ParksAr                  |  Cold ⛄ |
|------------------------------------------------------------------|
| ⛄ Cold storage type takes -SIGNIFICANTLY- longer to restore ⛄  |
*------------------------------------------------------------------*

💾 Which [ParksAr] backup would you like to restore from? [1,2]
>> 1

⭐ Confirm you want to restore [ParksAr] from [Jan 28 2025] and
continue? [y,n]
>> y

🔄 RESTORING [ParksAr] from duplicate...                       27s 🕝
```

<br>

---

<br>

### 6. `Delete a Table in DynamoDB`

_Estimated time to delete a table: 5s_

Delete an existing table in DynamoDB. This will ask you to confirm the deletion process if the table has Deletion Protection, and will confirm the table name again before deletion.

```
*------------------------*
|  TABLE MANAGEMENT      |
|------------------------------------------------------------------|
|    6    |    Delete a Table    | Delete a table in DynamoDB.     |
|         |     in DynamoDB      | Check for Deletion Protection.  |
*------------------------------------------------------------------*
```

An example of running this process:

```
*------------------------------------------------------------------*
|  Initializing DELETE TABLE option...                             |
*------------------------------------------------------------------*

*-------------------------------*
|  🗂️  CHOOSE A TABLE 🗂️        |
|------------------------------------------------------------------*
|  Table #   |  Table Name                                         |
|------------------------------------------------------------------|
|      1     |  ConfigAr                                           |
|      2     |  NameCacheAr                                        |
|      3     |  ParksAr                                            |
|      4     |  ar-tests                                           |
*------------------------------------------------------------------*

🗂️_ Please select a table to continue [1,2,3,4,5]
>> 3

⭐ Confirm to continue with [ParksAr]
table? [y,n]
>> y

❗ Confirm DELETION of the table
[ParksAr] and continue? [y,n]
>> y

🗑  DELETING [ParksAr] table...                                5s ✅
```

### 7. `Enable Point-in-Time Recovery (PITR)`

_Estimated time to enable PITR: 5s_

Enable Point-in-Time Recovery for an existing table in DynamoDB.

```
<br>

---

<br>

*------------------*
| TABLE MANAGEMENT |
|------------------------------------------------------------------|
|    7    |   Enable Point-in-   | Enable Point-in-Time Recovery   |
|         | Time Recovery (PITR) | for a table.                    |
*------------------------------------------------------------------*

```

### 8. `Enable Deletion Protection`

_Estimated time to enable Deletion Protection: 5s_

Enable Deletion Protection Recovery for a table.

```
<br>

---

<br>

*------------------*
| TABLE MANAGEMENT |
|------------------------------------------------------*
| 8 | Enable Deletion | Enable Deletion Protection for |
|   |   Protection    | a table.                       |
*------------------------------------------------------*

```

## Cleanup

The disaster recovery process will also initiate a cleanup after the PITR and AWS Snapshot restore processes if the user chooses to continue. This will clean up any lingering backups or duplicate tables that were created during the recovery process.

```
🪣  Would you like to initiate the cleanup process? This will
delete lingering resources created during the restore process.
Although this will check (and double check again) and ensure tables
are properly created/recreated, you may want to double check in AWS
yourself before continuing, or skip this and delete manually in the
AWS Console. Initiate cleanup here? [y,n]
>> y

🪣  CLEANING the duplicate [ParksAr--dupe-Jan-28-2025-08-29-20]  0s ✅

🪣  CLEANING the original backup [ParksAr--orig-Jan-28-2025-08-  0s ✅

🪣  CLEANING the duplicate backup [ParksAr--dupe-Jan-28-2025-08  0s ✅

✅ Finished cleaning.
```

If there is an `error` during a recovery process, the cleanup process will also run to clean up any backups that were created but not used.

> Note: an original backup that's queued for deletion will be back-checked with existing tables in DynamoDB - if a table no longer exists for the backup, the backup will be skipped for deletion in the cleanup process.

## FAQ

#### What is Point in Time Recovery?

- Point-in-Time Recovery (PITR) is a feature in AWS that provides automatic backups of a DynamoDB table data. When enabled, PITR snapshots a table every second, up to a maximum of 35 days, so you can restore a table from any point in time from 35 days ago until now. Additional information in [AWS's help document for Point-in-Time Recovery here](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html).

#### What is AWS Backup?

- AWS Backup is a service that makes it easy to centralize and automate data protection. AWS Backups can be scheduled to be created at any date, time, and frequency. AWS Backups is different from DynamoDB Backups in that AWS Backup allows users to back different types of services/resources in a "vault" and have it all centralized in one location in AWS. Additional information in [AWS's help document for AWS Backups here](https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html).

#### Why are some backups in DynamoDB Backups and some are in AWS Backup?

- To maintain clarity and to keep a separation of backups, the monthly snapshots are made in AWS Backup, whereas backups created during the restore process of the `Disaster Recovery` script are made in DynamoDB Backups.

- Some of the restore processes create a backup - in case of any issues during the restore process - to fallback on. Most of these backups are temporary and can be deleted shortly after the restore process is complete.

#### What's the difference between warm storage and cold storage?

- Cold storage is a term AWS uses for a type of data storage. Cold storage is one of the lowest costs for storing data in AWS, with the drawback that it takes significantly longer to access it on demand.

- Warm storage is another term AWS uses for data storage. Warm storage is slightly costlier than cold storage in AWS, but takes a significantly shorter time to access it on demand.

#### How can I Enable Point in Time Recovery in AWS?

- You can either enable PITR from the AWS console or using the `Enable Point-in-Time Recovery` table management option in the script. You can follow the instructions for enabling PITR in [AWS's help docs here](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html#howitworks_enabling).

#### What is Deletion Protection?

- Deletion Protection is a property that can be enabled on a DynamoDB table to provide safeguards and avoid accidental deletion. Additional information in [AWS's help document for Deletion Protection here](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/WorkingWithTables.Basics.html#WorkingWithTables.Basics.DeletionProtection).

#### How can I Enable Deletion Protection?

- You can either enable Deletion Protection from the AWS console or using the `Enable Deletion Protection` table management option in the script. You can follow the instructions for enabling PITR in [AWS's help docs here](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html#howitworks_enabling).

#### Where can I get help in the restore process?

- You can type `help` in the console to receive some information about the disaster recovery steps or some key terms in disaster recovery.

```
*------------------------*
|  HELP OPTIONS           |
*------------------------------------------------------------------*
|  Option    | Item                                                |
|------------------------------------------------------------------|
|    1       |  AWS Backups                                        |
|------------------------------------------------------------------|
|    2       |  AWS Snapshot Process                               |
|------------------------------------------------------------------|
|    3       |  Cold Storage                                       |
|------------------------------------------------------------------|
|    4       |  Deletion Protection                                |
|------------------------------------------------------------------|
|    5       |  DynamoDB Backups                                   |
|------------------------------------------------------------------|
|    6       |  Enabling Deletion Protection                       |
|------------------------------------------------------------------|
|    7       |  Enabling PITR                                      |
|------------------------------------------------------------------|
|    8       |  Point-in-Time (PITR)                               |
|------------------------------------------------------------------|
|    9       |  Point-in-Time (PITR) Recovery Process              |
|------------------------------------------------------------------|
|    10      |  Warm Storage                                       |
*------------------------------------------------------------------*

Which item do you require help with? [1 to 10]
>> 1

*------------------------------------------------------------------*
| AWS        | AWS Backup is a service used to centralize and help |
| Backups    | automate data protection in AWS. AWS Backups can be |
|            | scheduled to be created at just about any date,     |
|            | time, and frequency. AWS Backup allows users to     |
|            | back different types of services/resources and store|
|            | them in a "vault".                                  |
|            |                                                     |
|            | Note: These backups are NOT deleted during these    |
|            | processes.                                          |
*------------------------------------------------------------------*
```
