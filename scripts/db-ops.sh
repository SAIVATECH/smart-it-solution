#!/bin/bash

# Configuration variables
DB_CONTAINER_NAME="whatsapp_sales_db"
DB_USER="postgres"
DB_NAME="whatsapp_sales_platform"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql"

mkdir -p ${BACKUP_DIR}

case "$1" in
  backup)
    echo "Starting PostgreSQL backup..."
    docker exec -t ${DB_CONTAINER_NAME} pg_dump -U ${DB_USER} ${DB_NAME} > ${BACKUP_FILE}
    if [ $? -eq 0 ]; then
      echo "Backup successful! Saved to: ${BACKUP_FILE}"
    else
      echo "Backup failed!"
      exit 1
    fi
    ;;
  restore)
    if [ -z "$2" ]; then
      echo "Error: Please specify the SQL backup file path to restore."
      echo "Usage: $0 restore <backup_file_path>"
      exit 1
    fi
    echo "Starting restoration from $2..."
    docker exec -i ${DB_CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} < $2
    if [ $? -eq 0 ]; then
      echo "Restoration complete."
    else
      echo "Restoration failed!"
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {backup|restore}"
    echo "Restore usage: $0 restore <file_path>"
    exit 1
    ;;
esac
