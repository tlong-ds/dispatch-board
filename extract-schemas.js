const mongoose = require('mongoose');
const fs = require('fs');

// Note: In a larger app, these schemas would live in a separate "models.js" file.
// We reproduce them here to extract their structure without starting the Express server.

const itemSchema = new mongoose.Schema({
  text: { type: String, required: true }
});

const teamSchema = new mongoose.Schema({
  teamId: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  currentItem: { type: String, default: null },
  sentAt: { type: Date, default: null }
});

const models = {
  Item: itemSchema,
  Team: teamSchema
};

function generateSchemaDefinition() {
  const definitions = {};

  for (const [modelName, schema] of Object.entries(models)) {
    definitions[modelName] = {};
    for (const [path, obj] of Object.entries(schema.paths)) {
      // Skip Mongoose internal fields
      if (path === '__v' || path === '_id') continue;
      
      definitions[modelName][path] = {
        type: obj.instance,
        required: !!obj.isRequired,
        unique: !!obj.options.unique,
      };
      
      if (obj.defaultValue !== undefined) {
         definitions[modelName][path].default = typeof obj.defaultValue === 'function' ? 'function' : obj.defaultValue;
      }
    }
  }

  return definitions;
}

const schemas = generateSchemaDefinition();
const output = JSON.stringify(schemas, null, 2);

console.log('--- MongoDB Table (Collection) Definitions ---');
console.log(output);

fs.writeFileSync('db-schema.json', output);
console.log('\n✅ Successfully saved schema definitions to db-schema.json');
