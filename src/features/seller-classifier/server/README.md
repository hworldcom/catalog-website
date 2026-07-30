# Seller Classifier Server Boundary

The seller-classifier server modules authenticate the Bazoria user, resolve
their seller, and keep the classifier organization and batch identifiers
behind an opaque Bazoria workflow identifier. Browser code must use the
authenticated server functions and must never call the classifier with stored
identifiers directly.

Required server-only settings:

```text
BAZORIA_CLASSIFIER_API_BASE_URL
BAZORIA_DEFAULT_CLASSIFIER_ORGANIZATION_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional bounded timeout:

```text
BAZORIA_CLASSIFIER_BATCH_CREATE_TIMEOUT_SECONDS=30
BAZORIA_CLASSIFIER_COMMAND_TIMEOUT_SECONDS=30
```

The shared classifier organization is prototype-only. Production deployment
requires one classifier organization per seller.
