# Large Card Content System Documentation

This directory contains documentation for the Large Card Content System feature.

## Overview

The Large Card Content System enables Planka cards to support **10GB+ content** (vs the current 1MB limit) through an intelligent hybrid storage strategy.

## Migration Path

### ✅ Automatic (Recommended for 99% of users)

**No action required!** Cards automatically migrate from the old `description` field to the new content system when they are first edited.

- Zero downtime
- Zero user effort
- Happens transparently in the background
- No risk of migration failures

### ⚙️ Optional Bulk Pre-Migration (For administrators)

For large instances (>10,000 cards) where you want to pre-migrate all content:

```bash
npm run db:upgrade-card
```

**When to use:**
- Large Planka instances wanting to avoid first-edit slowness
- Migration during scheduled maintenance
- Testing migration before rollout

See `MIGRATION_STRATEGY.md` for detailed instructions.

## Documentation Files

| File | Description |
|------|-------------|
| `LARGE_CARD_CONTENT_IMPLEMENTATION.md` | Complete implementation guide and architecture |
| `HYBRID_STORAGE_STRATEGY.md` | Design rationale and storage strategy details |
| `MIGRATION_STRATEGY.md` | Step-by-step migration guide (optional bulk migration) |

## Key Features

- **Hybrid Storage**: Small content (<1MB) in PostgreSQL, large content (>1MB) in files
- **Auto-Migration**: Cards migrate automatically when edited
- **ACID Transactions**: Database integrity for inline storage
- **Auto-Promotion**: Content automatically moves from DB to files when it grows
- **Version History**: Full content versioning support
- **Inline Attachments**: Pasted images stored separately from card text
- **Backward Compatible**: Old system continues working until migration

## Quick Start

1. **Deploy**: Run database migrations with `npm run db:migrate`
2. **Use**: Start editing cards - they auto-migrate when saved
3. **Optional**: Pre-migrate all cards with `npm run db:upgrade-card`

## Configuration

All environment variables are optional:

```env
# Feature flag (default: enabled)
ENABLE_LARGE_CARD_CONTENT=true

# Storage thresholds (default: 1MB)
CARD_CONTENT_INLINE_THRESHOLD=1MB
CARD_CONTENT_EXTERNAL_THRESHOLD=1MB

# Limits (default: 10GB max, unlimited versions)
MAX_CARD_CONTENT_SIZE=10GB
CARD_CONTENT_VERSIONS_LIMIT=0

# Auto-promotion (default: enabled)
CARD_CONTENT_AUTO_PROMOTE=true
```

## Support

For questions or issues, see the detailed documentation files above or open an issue in the Planka repository.
