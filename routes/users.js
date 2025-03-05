const express = require("express")
const router = express.Router()
const User = require("../models/user")
const Bookmark = require("../models/bookmark")

//Get all user
// router.get("/", async (req ,res) => {
//     try {
//         const users = await User.find()
//         res.json(users)
//     } catch (err) {
//         res.status(500).json({ message: err.message })
//     }
// })

//Login user
router.post("/login", async (req, res) => {
    const { email, password, provider } = req.body;

    try {
        const user = await User.findOne({ email })
        .populate({
            path: "bookmarkList.bookmark",
            select: "mangaId coverId -_id",
        })
        .lean();

        if (!user) {
            if(provider === 'google') {
                return res.status(401).json({ message: "Email is not registered yet!" });
            }
            return res.status(401).json({ message: "Incorrect email or password." });
        }

        if(provider !== user.provider) {
            return res.status(401).json({ message: "Invalid Credentials!" });
        }

        if(user.provider !== 'google' && user.password !== password) {
            return res.status(401).json({ message: "Incorrect email or password." });
        }

        user.bookmarkList = user.bookmarkList.map(({ bookmark, status }) => ({
            bookmark: {
                mangaId: bookmark.mangaId,
                coverId: bookmark.coverId,
            },
            status
        }));

        res.json({
            id: user._id,
            name: user.name,
            createdAt: user.createdAt,
            bookmarkList: user.bookmarkList
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

//Register user
router.post("/", async (req ,res) => {
    const user = new User({
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        provider: req.body.provider,
    })

    const oldUser = await User.findOne({ email: req.body.email }); 
       
    try {
        if(oldUser) {
            return res.status(400).json({ error: "Email already exists" });
        }
        const newUser  = await user.save()
        console.log("newUser", newUser);
        res.status(201).send({
            id: user._id,
            name: user.name,
            createdAt: user.createdAt,
            bookmarkList: user.bookmarkList
        })
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: "Email already exists" });
        }
        console.log("error", err.message)
        res.status(400).json({ message: err.message })
    }
})

//Update User Bookmark
router.patch("/:id/bookmark", getUser, async (req, res) => {
    const { mangaId, coverId, status } = req.body;

    if (!mangaId || !coverId || !status) {
        return res.status(400).json({ error: "Manga Id or Cover Id or Status is required" });
    }

    try {
        let bookmark = await Bookmark.findOne({ mangaId });

        if (!bookmark) {
            bookmark = new Bookmark({ mangaId, coverId });
            await bookmark.save();
        }

        const user = res.user; // Get user from middleware

        const existingBookmark = user.bookmarkList.find(
            (item) => item.bookmark.toString() === bookmark._id.toString()
        );

        if (existingBookmark) {
            existingBookmark.status = status || existingBookmark.status;
        } else {
            user.bookmarkList.push({
                bookmark: bookmark._id,
                status: status || "reading", 
            });
        }

        await user.save();

        const updatedUser = await User.findById(user._id)
            .populate({
                path: "bookmarkList.bookmark",
                select: "mangaId coverId -_id",
            })
            .lean();

        updatedUser.bookmarkList = updatedUser.bookmarkList.map(({ bookmark, status }) => ({
            bookmark: {
                mangaId: bookmark.mangaId,
                coverId: bookmark.coverId,
            },
            status
        }));
        
        res.json({
            id: updatedUser._id,
            name: updatedUser.name,
            createdAt: updatedUser.createdAt,
            bookmarkList: updatedUser.bookmarkList
        });
    } catch (err) {
        console.error("Error updating bookmarks:", err);
        res.status(500).json({ message: err.message });
    }
});

//Delete User Bookmark
router.delete("/:id/bookmark", getUser, async (req, res) => {
    const { mangaId } = req.body;


    if (!mangaId) {
        return res.status(400).json({ error: "Manga Id is required" });
    }

    try {
        const bookmark = await Bookmark.findOne({ mangaId });

        if (!bookmark) {
            return res.status(404).json({ error: "Bookmark not found" });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $pull: { bookmarkList: { bookmark: bookmark._id } } },
            { new: true }
        )
        .populate({
            path: "bookmarkList.bookmark",
            select: "mangaId coverId -_id",
        })
        .lean();

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found" });
        }

        updatedUser.bookmarkList = updatedUser.bookmarkList.map(({ bookmark, status }) => ({
            bookmark: {
                mangaId: bookmark.mangaId,
                coverId: bookmark.coverId,
            },
            status
        }));

        res.json({
            id: updatedUser._id,
            name: updatedUser.name,
            createdAt: updatedUser.createdAt,
            bookmarkList: updatedUser.bookmarkList
        });
    } catch (err) {
        console.error("Error updating bookmarks:", err);
        res.status(500).json({ message: err.message });
    }
});

// Middleware to get user by ID
async function getUser(req, res, next) {
    let user;

    try {
        user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "Cannot Find User" });
        }
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }

    res.user = user;
    next();
}


module.exports = router