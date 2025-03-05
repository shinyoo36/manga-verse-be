    const mongoose = require("mongoose")

    const bookmarkSchema = new mongoose.Schema({
        mangaId: {
            type: String,
            required: true,
            unique: true,
        },
        coverId: {
            type: String,
            required: true,
        },
    })

    module.exports = mongoose.model('Bookmark', bookmarkSchema);