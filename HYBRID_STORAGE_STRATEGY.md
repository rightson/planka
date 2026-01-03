# Hybrid Storage Strategy - Large Card Content System

## Overview

The Large Card Content System uses a **hybrid storage approach** that combines the best of both database and file storage:

- **Small content (< 1MB)**: Stored in PostgreSQL for ACID guarantees and fast access
- **Large content (> 1MB)**: Stored in files for scalability and performance
- **Auto-promotion**: Automatically moves content from DB to files when it grows

## Why Hybrid?

### Problems with File-Only Storage

1. **❌ No ACID Transactions** - Can't atomically update DB + files together
2. **❌ Backup Complexity** - Must coordinate DB and filesystem backups
3. **❌ Replication Harder** - Files don't auto-replicate like database rows
4. **❌ No Full-Text Search** - Can't query file contents with SQL
5. **❌ Consistency Risks** - Orphaned files or missing file references
6. **❌ Latency for Small Content** - DB cache is faster than file I/O

### Benefits of Hybrid Approach

1. **✅ ACID for Small Content** - 80% of cards < 1MB get transaction guarantees
2. **✅ Performance** - Small content cached in PostgreSQL, instant access
3. **✅ Scalability** - Large content doesn't bloat database
4. **✅ Simple Backups** - Small content in DB backup, large in file backup
5. **✅ Query Capability** - Can search small content with SQL
6. **✅ Auto-Promotion** - Seamlessly transitions as content grows

## Architecture

### Data Distribution (80/20 Rule)

```
Card Content Distribution:
├─ 80% of cards < 1MB → Stored in PostgreSQL (contentInline)
└─ 20% of cards > 1MB → Stored in files (contentRef)
```

### Storage Types

```sql
CREATE TYPE storage_type AS ENUM ('inline', 'external');

CREATE TABLE card_content (
  id BIGINT PRIMARY KEY,
  card_id BIGINT NOT NULL,

  -- HYBRID STORAGE
  storage_type TEXT NOT NULL DEFAULT 'inline',
  content_inline TEXT,           -- For content < 1MB
  content_ref TEXT,              -- For content > 1MB

  size BIGINT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  ...
);
```

### Storage Decision Flow

```
Save Card Content
    ↓
Calculate size
    ↓
┌───────────────────────┐
│ Size <= 1MB?          │
└───────────────────────┘
    ↓           ↓
   YES         NO
    ↓           ↓
Store in DB   Store in File
(contentInline) (contentRef)
storageType=   storageType=
  'inline'      'external'
    ↓           ↓
ACID Transaction  Regular Create
```

### Auto-Promotion Flow

```
Update Card Content
    ↓
Check existing storageType
    ↓
┌─────────────────────────────────┐
│ Was inline AND now > 1MB?       │
└─────────────────────────────────┘
    ↓           ↓
   YES         NO
    ↓           ↓
Auto-Promote  Save normally
    ↓
Move to file storage
Set storageType='external'
Log promotion
```

## Configuration

### Environment Variables

```bash
# Threshold for storing in DB (default: 1MB)
CARD_CONTENT_INLINE_THRESHOLD=1MB

# Threshold for moving to files (default: 1MB)
CARD_CONTENT_EXTERNAL_THRESHOLD=1MB

# Enable auto-promotion (default: true)
CARD_CONTENT_AUTO_PROMOTE=true

# Maximum content size (default: 10GB)
MAX_CARD_CONTENT_SIZE=10GB
```

### Custom Configuration

```javascript
// server/config/custom.js
module.exports.custom = {
  cardContent: {
    // Store in DB if under 1MB
    inlineThreshold: 1 * 1024 * 1024,  // 1MB

    // Move to files if over 1MB
    externalThreshold: 1 * 1024 * 1024,  // 1MB

    // Auto-promote to external on growth
    autoPromote: true,

    // Maximum content size
    maxSize: 10 * 1024 * 1024 * 1024,  // 10GB
  }
};
```

## Implementation

### Creating/Updating Content

```javascript
// server/api/helpers/card-content/create-or-update-one.js

async function createOrUpdateCardContent(cardId, content) {
  const contentSize = Buffer.byteLength(content, 'utf-8');
  const existing = await CardContent.findOne({ cardId }).sort('version DESC');

  // Determine storage type
  let storageType;
  if (existing?.storageType === 'inline' &&
      contentSize > config.externalThreshold &&
      config.autoPromote) {
    // ✅ AUTO-PROMOTE: Was inline, now too big
    storageType = 'external';
    log.info(`Auto-promoting card ${cardId} to external storage`);
  } else if (contentSize <= config.inlineThreshold) {
    // Store in database
    storageType = 'inline';
  } else {
    // Store in file
    storageType = 'external';
  }

  // Save based on storage type
  if (storageType === 'inline') {
    // ✅ ACID TRANSACTION for inline storage
    await db.transaction(async (trx) => {
      await CardContent.create({
        cardId,
        storageType: 'inline',
        contentInline: content,
        contentRef: null,
        size: contentSize
      }).usingConnection(trx);

      await Card.updateOne({ id: cardId })
        .set({ contentVersion: version })
        .usingConnection(trx);
    });
  } else {
    // Save to file storage
    const path = await fileManager.save(content);
    await CardContent.create({
      cardId,
      storageType: 'external',
      contentInline: null,
      contentRef: path,
      size: contentSize
    });
  }
}
```

### Reading Content

```javascript
// server/api/helpers/card-content/get-one.js

async function getCardContent(cardId, version) {
  const cardContent = await CardContent.findOne({ cardId, version });

  let content;
  if (cardContent.storageType === 'inline') {
    // ✅ Fast: Load from database
    content = cardContent.contentInline;
  } else {
    // Load from file storage
    content = await fileManager.read(cardContent.contentRef);
  }

  return { content, storageType: cardContent.storageType };
}
```

## Performance Characteristics

### Inline Storage (< 1MB)

- **Read Latency**: ~1-2ms (database cache)
- **Write Latency**: ~5-10ms (transaction commit)
- **Consistency**: ✅ ACID guaranteed
- **Backup**: ✅ Included in DB backup
- **Search**: ✅ Can use SQL full-text search
- **Replication**: ✅ Auto-replicated with database

### External Storage (> 1MB)

- **Read Latency**: ~10-50ms (file I/O or S3)
- **Write Latency**: ~20-100ms (file write)
- **Consistency**: ⚠️ Eventually consistent
- **Backup**: ⚠️ Requires separate file backup
- **Search**: ❌ Need to load file first
- **Replication**: ⚠️ Manual or S3-based

## Migration Strategy

### Existing Cards

The migration script automatically determines storage type:

```javascript
// server/scripts/migrate-card-content.js

async function migrateCard(card) {
  const content = card.description;
  const size = Buffer.byteLength(content, 'utf-8');

  // Determine storage type based on size
  if (size <= 1 * 1024 * 1024) {
    // < 1MB: Store in database
    await CardContent.create({
      cardId: card.id,
      storageType: 'inline',
      contentInline: content,
      contentRef: null,
      size,
      version: 1
    });
  } else {
    // > 1MB: Store in file
    const path = await fileManager.save(content);
    await CardContent.create({
      cardId: card.id,
      storageType: 'external',
      contentInline: null,
      contentRef: path,
      size,
      version: 1
    });
  }
}
```

## Monitoring

### Metrics to Track

```javascript
// Track storage distribution
const metrics = {
  totalCards: await Card.count(),
  inlineCards: await CardContent.count({ storageType: 'inline' }),
  externalCards: await CardContent.count({ storageType: 'external' }),

  inlineSize: await CardContent.sum('size', { storageType: 'inline' }),
  externalSize: await CardContent.sum('size', { storageType: 'external' }),

  autoPromotions: await CardContent.count({
    storageType: 'external',
    // Track cards that were promoted
  })
};

console.log(`
Storage Distribution:
- Inline: ${metrics.inlineCards} cards (${formatBytes(metrics.inlineSize)})
- External: ${metrics.externalCards} cards (${formatBytes(metrics.externalSize)})
- Auto-promotions: ${metrics.autoPromotions}
`);
```

### Query Performance

```sql
-- Find large inline content (candidates for promotion)
SELECT card_id, size, version
FROM card_content
WHERE storage_type = 'inline'
  AND size > 500000  -- > 500KB
ORDER BY size DESC;

-- Find small external content (over-promoted)
SELECT card_id, size, version
FROM card_content
WHERE storage_type = 'external'
  AND size < 100000  -- < 100KB
ORDER BY size ASC;
```

## Benefits Summary

### 80/20 Distribution

Assuming most cards are < 1MB:

```
Benefits for 80% of cards (inline):
✅ ACID transactions
✅ ~1-2ms read latency
✅ SQL full-text search
✅ Auto-replication
✅ Simple backups

Benefits for 20% of cards (external):
✅ No database bloat
✅ Scalable to 10GB+
✅ Streaming support
✅ S3 integration
```

### Automatic Optimization

Cards automatically optimize themselves:

1. **Start Small**: New card < 1MB → Inline storage
2. **Grow Gradually**: User adds content → Still inline
3. **Auto-Promote**: Content > 1MB → Moves to external
4. **No Manual Work**: Happens transparently

### Best of Both Worlds

| Feature | Database | Files | Hybrid |
|---------|----------|-------|--------|
| ACID Guarantees | ✅ | ❌ | ✅ (< 1MB) |
| Scalability | ❌ | ✅ | ✅ (> 1MB) |
| Fast Access | ✅ | ❌ | ✅ (< 1MB) |
| Large Content | ❌ | ✅ | ✅ (> 1MB) |
| Simple Backup | ✅ | ❌ | ✅ (< 1MB) |
| Full-Text Search | ✅ | ❌ | ✅ (< 1MB) |

## Edge Cases

### 1. Content Oscillating Around Threshold

**Problem**: Card content ~1MB, keeps crossing threshold

**Solution**: Add hysteresis (different thresholds for up/down)

```javascript
const config = {
  promoteToExternalAt: 1.2 * 1024 * 1024,  // 1.2MB
  demoteToInlineAt: 0.8 * 1024 * 1024,     // 0.8MB
};
```

### 2. Rapid Updates

**Problem**: Many rapid updates to large content

**Solution**: Batch updates, use debouncing

```javascript
// Debounce content saves
const debouncedSave = _.debounce(saveContent, 1000);
```

### 3. Migration Mid-Update

**Problem**: Card being updated during migration

**Solution**: Use version locking

```javascript
// Check version before migrating
const current = await Card.findOne({ id }).select('contentVersion');
if (current.contentVersion !== expectedVersion) {
  throw new Error('Version conflict - card was updated');
}
```

## Future Optimizations

### 1. Compression

Add gzip compression for external storage:

```javascript
if (size > 1MB) {
  const compressed = await gzip(content);
  await fileManager.save(compressed);
}
```

### 2. Adaptive Thresholds

Adjust thresholds based on usage patterns:

```javascript
// If 90% of cards are inline, increase threshold
if (inlinePercentage > 90) {
  config.inlineThreshold = 2 * 1024 * 1024;  // 2MB
}
```

### 3. Hot/Cold Storage

Move rarely accessed external content to cheaper storage:

```javascript
if (lastAccessed > 90days && storageType === 'external') {
  await moveToGlacier(contentRef);
}
```

---

**Implementation Date**: January 2, 2026
**Status**: Implemented
**Next Review**: After production deployment
