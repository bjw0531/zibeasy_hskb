# Recovery Guide

## Restore using backup tag

```bash
git checkout backup-YYYYMMDD-HHMM
```

## Create a restore branch from backup tag

```bash
git switch -c restore/from-backup backup-YYYYMMDD-HHMM
```

## Return to current main branch

```bash
git switch main
```
