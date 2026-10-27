migrate(
  (app) => {
    const pulsosCol = app.findCollectionByNameOrId('pulsos')
    if (pulsosCol) {
      if (!pulsosCol.fields.getByName('feedback_texto')) {
        pulsosCol.fields.add(
          new TextField({
            name: 'feedback_texto',
            required: false,
          }),
        )
        app.save(pulsosCol)
      }
    }
  },
  (app) => {
    const pulsosCol = app.findCollectionByNameOrId('pulsos')
    if (pulsosCol && pulsosCol.fields.getByName('feedback_texto')) {
      pulsosCol.fields.removeByName('feedback_texto')
      app.save(pulsosCol)
    }
  },
)
