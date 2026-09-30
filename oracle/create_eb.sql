-- Creates (or resets) the Oracle user EB in XEPDB1 for the Ignition connection "myOracle".
-- Run as calAdmin:
--   E:\orcl\dbhomeXE\bin\sqlplus.exe system@//localhost:1521/XEPDB1 @E:\aaa_projects\ParkTemp\oracle\create_eb.sql
-- sqlplus asks for the SYSTEM password, then for the new EB password.
set verify off
whenever sqlerror continue
show con_name
accept pwd char prompt 'New password for EB: ' hide

-- fails with ORA-01920 if EB already exists; the ALTER below then resets it
CREATE USER eb IDENTIFIED BY "&pwd" QUOTA UNLIMITED ON USERS;
ALTER USER eb IDENTIFIED BY "&pwd" ACCOUNT UNLOCK;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW,
      CREATE TRIGGER, CREATE PROCEDURE TO eb;

prompt
prompt Done. Enter the same password on the Ignition connection myOracle.
exit
