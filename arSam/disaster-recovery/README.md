# Disaster Recovery

This script assists in backing up and restoring DynamoDB tables using Point-in-Time Recovery (PITR) or AWS Backups, as well as providing some more fine-grained operations for creating a backup in DynamoDB, restoring from a DynamoDB backup or AWS Backup, deleting a table from DynamoDB, and turning on PITR or Deletion Protection for a table.

By default, all production tables in DynamoDB have PITR enabled and a schedule of AWS Backup snapshots at the start of every month. This means a table can be recreated from any series of backups ranging from any second in the last 35 days (using PITR), to a backup snapshot from 1 year ago (using AWS Backups).

> Refer to [Setting up AWS for Disaster Recovery](#setting-up-aws-for-disaster-recovery) for configuring all backup settings for DynamoDB.

<br>
<br>

## Table of Contents

- [Quick Start](#quick-start)
- [Config.js](#configjs)

  - [environment](#environment)
  - [vaultName](#vaultname)
  - [backupRole](#backuprole)
  - [Config.js Check](#configjs-check)

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
- [Setting up AWS for Disaster Recovery](#setting-up-aws-for-disaster-recovery)
  - [IAM Roles and Policies](#iam-roles-and-policies)
  - [AWS Backup](#aws-backup)
    - [Vault](#vault)
    - [Backup Plan and Rule](#backup-plan-and-rule)
    - [Resource assignments](#resource-assignments)
  - [DynamoDB Options](#dynamodb-options)
    - [Point-in-time recovery (PITR)](#point-in-time-recovery-pitr)
    - [Deletion Protection](#deletion-protection)
- [FAQ](#faq)
  - [What is Point in Time Recovery?](#what-is-point-in-time-recovery)
  - [What is AWS Backup?](#what-is-aws-backup)
  - [Why are some backups in DynamoDB Backups and some are in AWS Backup?](#why-are-some-backups-in-dynamodb-backups-and-some-are-in-aws-backup)
  - [What's the difference between warm storage and cold storage?](#whats-the-difference-between-warm-storage-and-cold-storage)
  - [How can I Enable Point in Time Recovery in AWS?](#how-can-i-enable-point-in-time-recovery-in-aws)
  - [What is Deletion Protection?](#what-is-deletion-protection)
  - [How can I Enable Deletion Protection?](#how-can-i-enable-deletion-protection)
  - [Where can I get help in the restore process?](#where-can-i-get-help-in-the-restore-process)

<br>
<br>

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

> The `config.js` file will be checked when the script is started to ensure that the proper environment, vault names role, and policies are in place. Check the section [Config.js](#configjs-check) for more information on what's required in the config.

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
✅ No issues with the config! Continuing...

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
|         | est. time cold: ~3h  |                                 |
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

## Config.js

The `config.js` file consists of several items required for running the Disaster Recovery steps. The three most important items are:

### `environment`

This is the current AWS environment that the restore operations will run in. As a safety net, this is separately set in the config file instead of being read from the current _BC Gov AWS login_ portal credentials.

### `vaultName`

This is the vault name that will be used for AWS Backup operations. In order to restore from AWS Backup, the DynamoDB tables must exist in a pre-existing vault. More information in [AWS's help document for AWS Backups here](https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html#backup-access-policies).

### `backupRole`

This is the role that's used for AWS Backup operations. In order to restore AWS Backup, a new role must be created with the policy [AWSBackupServiceRolePolicyForRestores](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForRestores.html) in order to restore from AWS Backup. This role is used in certain AWS CLI calls.

### Config.js Check

The script performs initial validation of the `config.js` file:

- **Environment Configuration**: Verifies that the specified `environment` parameter aligns with the _BC Gov AWS login_ portal credentials
- **Vault Verification**: Confirms that the designated `vaultName` corresponds to an existing AWS Backup vault
- **Role Authentication**: Validates that the specified `backupRole` possesses the required - [AWSBackupServiceRolePolicyForRestores](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForRestores.html) policy for table restoration operations
- **Timeout Setting**: Ensures the `timeout` parameter is properly configured

If any validation check fails, the script will terminate execution to prevent potential configuration-related issues.

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

🗂️ Please select a table to continue [1 to 6]
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

_Estimated time to recovery from warm storage: ~20m_<br>
_Estimated time to recovery from cold storage: ~3h_

Replaces an existing table with a backup in AWS Backups. The table **must already exist** in DynamoDB to initiate a restore. To restore a table that _no longer exists_ using AWS Backup, you can use [AWS Restore from table management](#5-restore-from-aws-backup).

> Note: AWS Backups are made in 1-month increments and are held in the AWS Backup vault for 1 year. After a backup is created, it's held in **warm storage** for 8 days before being moved to **cold storage**. If restoring from cold storage, expect the process to take upwards of --**three hours**--.

```
*------------------------*
|  AUTO RESTORE OPTIONS  |
|------------------------------------------------------------------|
|    2    |      AWS Backup      | Allows you to choose a snapshot |
|         |       Snapshot       | from the last 12 months (this   |
|         |                      | is SIGNIFICANTLY faster if it's |
|         | est. time warm: ~20m | coming from warm storage).      |
|         | est. time cold: ~3h  |                                 |
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

🗂️ Please select a table to continue [1,2,3,4,5]
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

🗂️ Please select a table to continue [1,2,3,4,5]
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

🖋️  Enter the name of the table you'd like to restore. Only tables with matching backup names will be available for selection.
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

_Estimated time to recovery from warm storage: ~20m_

This restore a table from a backup found in **AWS Backups**. The table to be restored **must not exist in DynamoDB currently**. The backup requires a typed-out table name to find available backups matching that table name in AWS Backups.

> Note: AWS Backups are made in 1-month increments and are held in the AWS Backup vault for 1 year. After a backup is created, it's held in **warm storage** for 8 days before being moved to **cold storage**. If restoring from cold storage, expect the process to take upwards of **three hours**.

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

🖋️  Enter the name of the table you'd like to restore. Only tables
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

🗂️ Please select a table to continue [1,2,3,4,5]
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

<br>
<br>

## Setting up AWS for Disaster Recovery

These are the steps to configure all backup settings in AWS, which in turn will enable the Disaster Recovery operations to run properly.

<br>

---

### IAM Roles and Policies

In order to create backups in **AWS Backup** and restore from an AWS Backup snapshot, the AWS environment will require the user to create a **backup role**. This backup role is what's provided in `backupRole` in the `config.js` file.

This role must have the following **policies**:

- [AWSBackupServiceRolePolicyForBackup](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForBackup.html)
- [AWSBackupServiceRolePolicyForRestores](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSBackupServiceRolePolicyForRestores.html)

![](./images/iam-role-policies.png)

**AWSBackupServiceRolePolicyForBackup** is required in order to create the backups in AWS Backup, otherwise you will receive an `Access denied` status update in your backup job in AWS Backup. This is used in the [Resource assignments](#resource-assignments) steps below.

**AWSBackupServiceRolePolicyForRestores** is required in order to restore a table from an AWS Backup snapshot in AWS Backup, otherwise you will see an `Insufficient privileges to perform this action` error in the console when running the restore operations.

<br>

---

### AWS Backup

To get started with AWS Backup, you will be required to create a dedicated **Vault** to store all backup recovery points created, a **Backup Plan and Rule** which determines when items are backed up, and **Resource assignments** to specify which items are backed up following the backup plan's rules.

#### Vault

A new vault can be created in AWS Backup by selecting **Vault** in AWS Backup and clicking the **Create new vault** button. All that's required at this point is a suitable vault name.

![](./images/vault-name.png)

#### Backup Plan and Rule

AWS Backup provides centralized backup management through backup plans and rules. These plans define when and how your AWS resources are backed up, allowing you to automatically protect your tables according to a customizable schedule.

1. Navigate to the **AWS Backup** dashboard and select **Backup plans** from the left-side menu.

1. From the **Backup plans** dashboard, click the **Create backup plan** button.

1. In the **Create backup plan** screen, select **Build a new plan**.

1. Choose a **Backup plan name**. For example, _[app name]-backup-plan_

![](./images/backup-plan-name.png)

5. Under **Backup rule configuration**, choose a **Backup rule name**. For example, _monthly-backup_

1. Choose your **Backup vault** that was created in the Vault section above.

1. Choose the **Backup frequency**. For example, you can choose _monthly_ and then select on _Day 1_ to backup each month on the first of the month.

![](./images/backup-rule-name.png)

8. Under **Backup window**, choose the desired backup window. This is a specific window of time when the backup will initiate. For example, you can specify _3:30 America/Los Angeles (UTC-08:00)_ to run the backup at 3:30 am. You can also provide a period of time for the table to start and end in. For example, start within _8 hours_ and end within _7 days_.

![](./images/backup-window.png)

9. _DO NOT SELECT_ **Point-in-time recovery**, as this limits your options for warm and cold storage (this can be enabled later from [DynamoDB table options](#point-in-time-recovery-pitr).

1. Under **Lifecycle**, select **Move backups from warm to cold storage** to control when backups are moved to cold storage from warm storage.

1. Choose the **Time in warm storage**. For example, _8 days_.

1. Choose the **Total retention period**. For example, _1 year_. This will hold your AWS Backups in cold storage for a total of 1 year before being deleted.

![](./images/backup-lifecycle.png)

13. When done, click the **Add backup rule** button to create the backup plan and rule.

#### Resource assignments

Once the backup plan and rule is created, you can allocate the AWS resources to follow this rule.

1. Navigate to the **AWS Backup** dashboard and select **Backup Plan** from the left-side menu.

1. Select the newly created backup plan.

1. From the newly created backup plan's dashboard, under the **Resource assignments** section, click **Assign resources**.

1. Choose a **Resource assignment name**. For example, _dynamo-backup_.

1. Under **IAM Role**, select **Choose an IAM role** and use the IAM Role created in [IAM Roles and Policies](#iam-roles-and-policies) above. This backup role must have the **AWSBackupServiceRolePolicyForBackup** policy in order to create backups in AWS Backup.

![](./images/assign-resource-name-and-role.png)

6. Under **Define resource selection**, select **Include specific resource types** to select individual items in DynamoDB.

1. Under **Select specific resource types**, choose _DynamoDB_. **Resource type** and **Table names** will appear - select all tables that you would like to backup.

![](./images/assign-resources-resource-selection.png)

8. When done, click the **Assign resources** button to confirm resources.

<br>

---

### DynamoDB Options

The only options that need to be enabled in DynamoDB are Point-in-time recovery and Deletion protection. These will ensure that your DynamoDB table can be retrieved at any point in time in the last 35 days, and has added protection from accidental deletion.

#### Point-in-time recovery (PITR)

1. Navigate to the **DynamoDB** dashboard and select **Tables** from the left-side menu.

1. Click the table name you would like to enable PITR on to open the table's dashboard in DynamoDB.

1. Click the **Actions** button in the top-right corner and select **Edit Point-in-time recovery**.

![](./images/pitr-actions-edit.png)

4. Under the **Point-in-time recovery (PITR)** section, select **Turn on point-in-time recovery**

1. Choose the **Backup recovery period**. For example, _35 days_.

![](./images/pitr-edit-setting.png)

6. When done, click **Save changes** to enable PITR.

#### Deletion Protection

1. Navigate to the **DynamoDB** dashboard and select **Tables** from the left-side menu.

1. Click the table name you would like to enable Deletion Protection on to open the table's dashboard in DynamoDB.

1. Select **Additional settings** from the top-menu on the table's dashboard.

![](./images/deletion-protection-additional-settings.png)

4. Under **Deletion protection** section, select **Turn on**.

![](./images/deletion-protection.png)

5. When the **Turn on deletion protection** pop-up appears, click **Confirm** to enable Deletion Protection.

<br>
<br>

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
