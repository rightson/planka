# Migration Strategy - Hybrid Card Content System

## Overview

This document describes the migration strategy for moving existing cards from the legacy `description` field to the new hybrid card content system.

## Migration Goals

1. **Zero Downtime**: Migration happens gradually, no service interruption
2. **Optimal Storage**: Automatically choose inline (DB) vs external (files) based on size
3. **ACID Guarantees**: Use transactions for inline storage to prevent orphaned data
4. **Reversible**: Can rollback if needed
5. **Verifiable**: Track and verify migration results

## Hybrid Storage Decision

### Size Thresholds

```javascript
const inlineThreshold = 1 * 1024 * 1024;  // 1MB

if (contentSize <= inlineThreshold) {
  // Store in PostgreSQL (contentInline)
  // ✅ ACID transaction
  // ✅ Fast access (~1-2ms)
  // ✅ SQL searchable
} else {
  // Store in files (contentRef)
  // ✅ Scalable (up to 10GB+)
  // ✅ No DB bloat
  // ✅ S3 compatible
}
```

### Decision Flow

```
Migration Process
    ↓
Extract base64 images
    ↓
Calculate migrated content size
    ↓
┌─────────────────────────┐
│ Size <= 1MB?            │
└─────────────────────────┘
    ↓           ↓
   YES         NO
    ↓           ↓
INLINE      EXTERNAL
    ↓           ↓
Store in DB  Store in File
Use ACID     Regular create
transaction
```

## Migration Phases

### Phase 1: Pre-Migration Analysis

```bash
# Dry run to analyze distribution
node server/scripts/migrate-card-content.js --dry-run

# Sample output:
📊 Found 1000 cards to migrate

📦 Hybrid Storage Distribution (estimated):
================================
💿 Inline (DB):      800 cards (450 MB) - 80%
📁 External (Files): 200 cards (15 GB) - 20%
```

**What to look for:**
- **Inline percentage**: Should be 70-90% for optimal performance
- **External size**: Should be reasonable for your storage backend
- **Average sizes**: Helps validate thresholds are correct

### Phase 2: Test Migration

```bash
# Migrate a single card first
node server/scripts/migrate-card-content.js --card-id=123

# Sample output:
Card 123: Migrating...
  Found 2 base64 images
  ✅ Created inline attachment 1/2
  ✅ Created inline attachment 2/2
  📦 Storage: inline (450 KB - will use DB)
  ✅ Card 123 migrated to INLINE storage (ACID transaction)
```

**Verify:**
- Check card loads correctly
- Check inline attachments render
- Check database record created
- For external: Check file created

### Phase 3: Batch Migration

```bash
# Migrate in batches (default: 100 cards at a time)
node server/scripts/migrate-card-content.js

# Or customize batch size
node server/scripts/migrate-card-content.js --batch-size=50
```

**Monitor:**
- Database size growth (inline storage)
- File storage usage (external storage)
- Migration speed (cards/minute)
- Error rate

### Phase 4: Verification

After migration, verify results:

```sql
-- Check distribution
SELECT
  storage_type,
  COUNT(*) as count,
  SUM(size) as total_size,
  AVG(size) as avg_size,
  MIN(size) as min_size,
  MAX(size) as max_size
FROM card_content
GROUP BY storage_type;

-- Expected output:
-- storage_type | count | total_size  | avg_size | min_size | max_size
-- inline       | 800   | 450,000,000 | 562,500  | 100      | 1,048,576
-- external     | 200   | 15,000,000,000 | 75,000,000 | 1,048,577 | 500,000,000
```

## Migration Script Features

### 1. Dry Run Mode

Test migration without making changes:

```bash
node server/scripts/migrate-card-content.js --dry-run
```

**What it does:**
- Analyzes all cards
- Estimates storage type
- Shows distribution stats
- **Does NOT** modify database or create files

### 2. Resume Mode

Continue from previous failure:

```bash
node server/scripts/migrate-card-content.js --resume
```

**What it does:**
- Skips already migrated cards
- Continues with remaining cards
- Useful after errors or interruptions

### 3. Single Card Mode

Test with specific card:

```bash
node server/scripts/migrate-card-content.js --card-id=123
```

**Use cases:**
- Testing migration logic
- Debugging specific card issues
- Manual migration for important cards

### 4. Batch Size Control

Control migration speed:

```bash
# Smaller batches (slower, safer)
node server/scripts/migrate-card-content.js --batch-size=10

# Larger batches (faster, more resource intensive)
node server/scripts/migrate-card-content.js --batch-size=500
```

## Migration Statistics

After migration completes, you'll see:

```
📈 Migration Statistics:
======================
Total cards:              1000
✅ Successfully migrated: 995
⏭️  Skipped:               3
❌ Errors:                2
🖼️  Inline attachments:    1500
💾 Size reduction:        5.2 GB (33%)

📦 Hybrid Storage Distribution:
================================
💿 Inline (DB):           798 cards (445 MB) - 80%
📁 External (Files):      197 cards (14.8 GB) - 20%
📊 Average inline size:   558 KB
📊 Average external size: 75 MB
```

## Performance Characteristics

### Inline Storage Migration

```javascript
// Uses ACID transaction
await db.transaction(async (trx) => {
  await CardContent.create({
    storageType: 'inline',
    contentInline: content  // Stored in DB
  }).usingConnection(trx);

  await Card.updateOne({ id })
    .set({ contentMigrated: true })
    .usingConnection(trx);
});
```

**Benefits:**
- ✅ Atomic operation (all or nothing)
- ✅ No orphaned records
- ✅ Immediate consistency
- ✅ No file I/O latency

**Speed:** ~50-100 cards/minute

### External Storage Migration

```javascript
// Save to file, then create record
const path = await fileManager.save(content);
await CardContent.create({
  storageType: 'external',
  contentRef: path  // File reference
});
```

**Benefits:**
- ✅ No database bloat
- ✅ Scalable to large content
- ✅ Works with S3

**Speed:** ~20-50 cards/minute (depends on file I/O)

## Threshold Optimization

### Finding Optimal Threshold

Analyze your data distribution:

```sql
-- Distribution of content sizes
SELECT
  CASE
    WHEN LENGTH(description) < 100000 THEN '< 100KB'
    WHEN LENGTH(description) < 500000 THEN '100KB - 500KB'
    WHEN LENGTH(description) < 1000000 THEN '500KB - 1MB'
    WHEN LENGTH(description) < 5000000 THEN '1MB - 5MB'
    ELSE '> 5MB'
  END as size_range,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM card
WHERE description IS NOT NULL
GROUP BY size_range
ORDER BY MIN(LENGTH(description));

-- Example output:
-- size_range    | count | percentage
-- < 100KB       | 750   | 75.00
-- 100KB - 500KB | 150   | 15.00
-- 500KB - 1MB   | 50    | 5.00
-- 1MB - 5MB     | 40    | 4.00
-- > 5MB         | 10    | 1.00
```

### Recommended Thresholds

Based on your distribution:

| Distribution | Recommended Threshold | Reasoning |
|--------------|----------------------|-----------|
| 90% < 500KB | 1MB | Conservative, most in DB |
| 80% < 1MB | 1MB | Balanced (recommended) |
| 70% < 2MB | 2MB | More aggressive DB usage |
| 50% < 500KB | 500KB | Conservative, less DB load |

### Adjusting Threshold

If needed, adjust before migration:

```bash
# Use 2MB threshold instead of 1MB
CARD_CONTENT_INLINE_THRESHOLD=2MB node server/scripts/migrate-card-content.js --dry-run

# Use 500KB threshold (more conservative)
CARD_CONTENT_INLINE_THRESHOLD=500KB node server/scripts/migrate-card-content.js --dry-run
```

## Error Handling

### Common Errors

#### 1. File System Permission Error

```
❌ Card 123 migration failed: EACCES: permission denied
```

**Solution:**
```bash
# Fix permissions on uploads directory
chmod -R 755 /path/to/uploads/private/card-content
```

#### 2. Database Transaction Timeout

```
❌ Card 456 migration failed: Transaction timeout
```

**Solution:**
```bash
# Reduce batch size
node server/scripts/migrate-card-content.js --batch-size=10
```

#### 3. Out of Memory

```
❌ JavaScript heap out of memory
```

**Solution:**
```bash
# Increase Node.js memory
NODE_OPTIONS=--max-old-space-size=4096 node server/scripts/migrate-card-content.js
```

### Error Recovery

```bash
# 1. Fix the issue
# 2. Resume migration
node server/scripts/migrate-card-content.js --resume

# The script will:
# - Skip already migrated cards
# - Continue with remaining cards
# - Show updated statistics
```

## Rollback Strategy

If you need to rollback migration:

```javascript
// server/scripts/rollback-migration.js

async function rollbackCard(cardId) {
  const cardContent = await CardContent.findOne({ cardId })
    .sort('version DESC');

  let content;
  if (cardContent.storageType === 'inline') {
    // Get from DB
    content = cardContent.contentInline;
  } else {
    // Read from file
    content = await fileManager.read(cardContent.contentRef);
  }

  // Convert inline:// back to base64 (if needed)
  content = await resolveInlineAttachments(content);

  // Restore to description field
  await Card.updateOne({ id: cardId }).set({
    description: content,
    contentMigrated: false
  });

  // Delete new content record
  await CardContent.destroy({ cardId });
}
```

## Monitoring During Migration

### Real-Time Monitoring

```bash
# Terminal 1: Run migration
node server/scripts/migrate-card-content.js

# Terminal 2: Monitor database
watch -n 5 "psql -c '
  SELECT storage_type, COUNT(*),
         pg_size_pretty(SUM(size))
  FROM card_content
  GROUP BY storage_type
'"

# Terminal 3: Monitor file storage
watch -n 5 "du -sh /path/to/uploads/private/card-content"
```

### Key Metrics

| Metric | Command | What to Watch |
|--------|---------|---------------|
| Migration speed | Check script output | Cards/minute |
| DB size | `SELECT pg_database_size('planka')` | Should grow for inline cards |
| File storage | `du -sh card-content/` | Should grow for external cards |
| Error rate | Check script output | Should be < 1% |

## Best Practices

### 1. Test First

```bash
# Always start with dry-run
node server/scripts/migrate-card-content.js --dry-run

# Then test single card
node server/scripts/migrate-card-content.js --card-id=123
```

### 2. Backup First

```bash
# Backup database
pg_dump planka > planka_backup_$(date +%Y%m%d).sql

# Backup files (if any existing card-content)
tar -czf card_content_backup_$(date +%Y%m%d).tar.gz \
  /path/to/uploads/private/card-content
```

### 3. Off-Peak Migration

Run during low-traffic periods:
- Reduces impact on users
- Faster migration (less DB contention)
- Easier to monitor

### 4. Gradual Rollout

For large deployments:

```bash
# Day 1: Migrate 10% (dry-run + test)
node server/scripts/migrate-card-content.js --dry-run

# Day 2: Migrate 100 cards (test)
# Manually select 100 card IDs, migrate individually

# Day 3: Migrate 1000 cards (batch)
node server/scripts/migrate-card-content.js --batch-size=100

# Day 4: Migrate remaining
node server/scripts/migrate-card-content.js --resume
```

## Verification Queries

After migration, verify data integrity:

```sql
-- 1. Check all cards are migrated
SELECT COUNT(*) FROM card
WHERE content_migrated = false
  AND description IS NOT NULL;
-- Expected: 0

-- 2. Verify content sizes match storage type
SELECT COUNT(*) FROM card_content
WHERE storage_type = 'inline' AND size > 1048576;
-- Expected: 0 (no inline content > 1MB)

SELECT COUNT(*) FROM card_content
WHERE storage_type = 'external' AND size <= 1048576;
-- Expected: 0 (no external content <= 1MB)

-- 3. Check file references exist
SELECT COUNT(*) FROM card_content
WHERE storage_type = 'inline' AND content_inline IS NULL;
-- Expected: 0

SELECT COUNT(*) FROM card_content
WHERE storage_type = 'external' AND content_ref IS NULL;
-- Expected: 0

-- 4. Verify version numbers
SELECT COUNT(*) FROM card_content
WHERE version != 1;
-- Expected: 0 (all migrated cards should be version 1)
```

## Expected Results

For a typical Planka instance with 1000 cards:

```
Before Migration:
- All content in card.description (PostgreSQL text field)
- Total size: ~500 MB (including base64 images)
- Average card size: ~500 KB

After Migration:
📦 Hybrid Distribution:
- 800 cards (80%) in inline storage (DB)
  - Total: 450 MB in database
  - Average: 560 KB per card
  - Fast access, ACID guaranteed

- 200 cards (20%) in external storage (files)
  - Total: 15 GB in files
  - Average: 75 MB per card
  - Scalable, no DB bloat

Benefits Achieved:
✅ 33% size reduction (base64 → files)
✅ 80% of cards have ACID guarantees
✅ 20% of cards offloaded from DB
✅ Zero downtime migration
✅ Fully reversible
```

---

**Migration Date**: TBD
**Script Location**: `/server/scripts/migrate-card-content.js`
**Documentation**: `/HYBRID_STORAGE_STRATEGY.md`
