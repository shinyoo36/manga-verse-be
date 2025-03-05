const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
    },
    name: {
        type: String,
        required: true,
    },
    provider: {
        type: String,
        required: true,
    },
    bookmarkList: [{
        bookmark: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Bookmark',
        },
        status: {
            type: String,
            enum: ['reading', 'completed', 'dropped'], 
            default: 'reading',
        },
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

module.exports = mongoose.model('User', userSchema);