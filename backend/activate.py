import ee

# Trigger the authentication flow
ee.Authenticate()

# Initialize the library (You will need a Google Cloud Project ID here)
# If you don't have one, the Authenticate step will guide you to create one.
ee.Initialize(project='mine-guard-506610')