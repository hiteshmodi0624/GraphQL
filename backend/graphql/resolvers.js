const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validator= require('validator');

const User=require("../models/user")
const Post=require("../models/post");
const { clearImage } = require('../util/file');

module.exports={
    createUser:async ({userInput},res)=>{
        const errors=[];
        const email=userInput.email;
        const password=userInput.password;
        const name=userInput.name;
        if(!validator.isEmail(email)){
            errors.push({message:"E-mail is Invalid"});
        }
        if(!validator.isLength(password,{min:5})){
            errors.push({message:"Password is very short"})
        }
        if(errors.length>0){
            const error=new Error("Input Error!")
            error.code=422
            error.data=errors;
            throw error
        }
        const existingUser=await User.findOne({email})
        if(existingUser){
            const error=new Error("User Exists!")
            error.code=422
            throw error;
        }
        const hashedPassword=await bcrypt.hash(password,12)
        const user =new User({
            email,password:hashedPassword,name
        })
        const createdUser=await user.save();
        return { ...createdUser._doc, _id:createdUser._id.toString() }
    },
    login:async({email,password})=>{
        const user =await User.findOne({email});
        if(!user){
            const error=new Error("User does not exist!")
            error.code=401
            throw error;
        }
        const isEqual=await bcrypt.compare(password,user.password);
        if(!isEqual){
            const error=new Error("Password is Incorrect!")
            error.code=401
            throw error;
        }
        const token = jwt.sign(
            {
                userId: user._id.toString(),
                email,
            },
            "someSuperSecretCode",
            { expiresIn: "1h" }
        );
        return { token, userId: user._id.toString() };
    },
    createPost:async({postInput},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!');
            error.code=401;
            throw error
        }
        const errors=[];
        if(!validator.isLength(postInput.title,{min:5})){
            errors.push("Title is Invalid")
        }
        if(!validator.isLength(postInput.content,{min:5})){
            errors.push("Content is Invalid")
        }
        console.log(errors)
        if(errors.length>0){
            const error=new Error('Invalid Input');
            error.data=errors
            error.code=422
            throw error
        }
        const user=await User.findById(req.userId);
        if(!user){
            const error= new Error('Invalid User!');
            error.code=401;
            throw error
        }
        const post =new Post({
            title:postInput.title,
            content:postInput.content,
            imageUrl:postInput.imageUrl,
            creator:user
        })
        const createdPost=await post.save();
        user.posts.push(createdPost);
        await user.save()
        return {
            ...createdPost._doc,
            _id: createdPost._id.toString(),
            createdAt: createdPost.createdAt.toISOString(),
            updatedAt: createdPost.updatedAt.toISOString(),
        };
    },
    posts:async({page},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        if(!page){
            page=1;
        }
        const perPage=2;

        const totalPosts=await Post.find().countDocuments();
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip((page-1)*perPage)
            .limit(perPage)
            .populate("creator");
        return {
            posts:posts.map(p=>{
                return {
                    ...p._doc,
                    _id: p._id.toString(),
                    createdAt: p.createdAt.toISOString(),
                    updatedAt: p.updatedAt.toISOString(),
                };
            }),
            totalPosts
        }

    },
    post:async({id},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        const post=await Post.findById(id).populate('creator');
        if(!post){
            const error= new Error('No post Found!');
            error.code=404;
            throw error
        }
        return {
            ...post._doc,
            _id:post._id.toString(),
            updatedAt:post.updatedAt.toISOString(),
            createdAt:post.createdAt.toISOString()
        }
    },
    updatePost:async({id,postInput},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        const post=await Post.findById(id).populate('creator');
        if(!post){
            const error= new Error('No post Found!');
            error.code=404;
            throw error
        }
        if(post.creator._id.toString()!==req.userId.toString()){
            const error= new Error('Not Authorised!!');
            error.code=403;
            throw error
        }
        const errors=[];
        if(!validator.isLength(postInput.title,{min:5})){
            errors.push("Title is Invalid")
        }
        if(!validator.isLength(postInput.content,{min:5})){
            errors.push("Content is Invalid")
        }
        console.log(errors)
        if(errors.length>0){
            const error=new Error('Invalid Input');
            error.data=errors
            error.code=422
            throw error
        }
        post.title=postInput.title
        post.content=postInput.content
        if(postInput.imageUrl!=='undefined')
            post.imageUrl=postInput.imageUrl
        const updatedPost=await post.save();
        return {
            ...updatedPost._doc,
            _id:updatedPost._id.toString(),
            updatedAt:updatedPost.updatedAt.toISOString(),
            createdAt:updatedPost.createdAt.toISOString()
        }
    },
    deletePost:async({id},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        const post=await Post.findById(id);
        if(!post){
            const error= new Error('No post Found!');
            error.code=404;
            throw error
        }
        if(post.creator._id.toString()!==req.userId.toString()){
            const error= new Error('Not Authorised!!');
            error.code=403;
            throw error
        }
        clearImage(post.imageUrl)
        const user=await User.findById(req.userId);
        user.posts.pull(post._id)
        await Post.findByIdAndRemove(id)
        await user.save()
        return true
    },
    user:async(args,req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        const user =await User.findById(req.userId);
        if(!user){
            const error=new Error("User does not exist!")
            error.code=401
            throw error;
        }
        return {
            ...user._doc,
            _id:user._id.toString(),
        }
    },
    updateStatus:async({status},req)=>{
        if(!req.isAuth){
            const error= new Error('Not Authenticated!!');
            error.code=401;
            throw error
        }
        const user =await User.findById(req.userId);
        if(!user){
            const error=new Error("User does not exist!")
            error.code=401
            throw error;
        }
        user.status=status
        await user.save()
        return {
            ...user._doc,
            _id:user._id.toString(),
        }
    }
}
