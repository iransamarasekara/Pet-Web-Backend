const port = 4000;
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const {S3Client,PutObjectCommand } = require('@aws-sdk/client-s3');
const {getSignedUrl} = require('@aws-sdk/s3-request-presigner');

require("dotenv").config();

const s2Client = new S3Client({ 
    region: 'eu-north-1',
    credentials: {
        accessKeyId:process.env.ACCESS_KEY_ID,
        secretAccessKey:process.env.SECRET_ACCESS_KEY
    }
});

const nodemailer = require('nodemailer');
const Mailgen = require('mailgen');

app.use(express.json());
app.use(cors());

// Database Connection With MongoDB
const uri = process.env.MONGODB_URI;

mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected...'))
  .catch(err => console.error('MongoDB connection error:', err));

const { timeStamp } = require("console");


// async function getObjectURL(key){
//     const params = {
//         Bucket: "moramerch",
//         Key: key,
        
//     }

//     try {
//         const url = await getSignedUrl(s2Client, new GetObjectCommand(params), { expiresIn: 900 });
//         return url;
//     } catch (error) {
//         console.error("Error generating signed URL", error);
//         return null;
//     }
// }

// async function putObject(filename, contentType){
//     const params = {
//         Bucket: "moramerch",
//         Key: 'myfiles/' + filename,
//         contentType: contentType,
//     }

//     const url = await getSignedUrl(s2Client, new PutObjectCommand(params));
//     return url;
// }

async function getPutObjectSignedUrl(filename, contentType) {
    const params = {
        Bucket: "moramerch",
        Key: `myfiles/${filename}`,
        ContentType: contentType,
    };

    const url = await getSignedUrl(s2Client, new PutObjectCommand(params), { expiresIn: 900 });
    return url;
}

async function getPutObjectSignedUrl2(filename, contentType) {
    const params = {
        Bucket: "moramerch",
        Key: `slipfiles/${filename}`,
        ContentType: contentType,
    };

    const url = await getSignedUrl(s2Client, new PutObjectCommand(params), { expiresIn: 900 });
    return url;
}



//API Creation

app.get("/", async (req, res)=>{
    res.send("Express App is Running")
})

// Endpoint to get a signed URL for uploading a file
app.get('/upload', async (req, res) => {
    const filename = "test.mp4";
    const contentType = "video/mp4";
    try {
        const url = await getPutObjectSignedUrl(filename, contentType);
        res.json({ url });
    } catch (error) {
        console.error("Error generating signed URL", error);
        res.status(500).send("Error generating signed URL");
    }
});

// Setting up multer middleware for handling multipart/form-data
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Creating upload endpoint for images
app.post("/upload", upload.single('product'), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send("No file uploaded.");
    }

    const filename = `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`;
    const contentType = file.mimetype;

    try {
        const url = await getPutObjectSignedUrl(filename, contentType);
        // Here you would typically upload the file to S3 using the signed URL.
        // This is a simplified example:
        const uploadParams = {
            Bucket: "moramerch",
            Key: `myfiles/${filename}`,
            Body: file.buffer,
            ContentType: contentType,
        };
        await s2Client.send(new PutObjectCommand(uploadParams));

        res.json({
            success: 1,
            image_url: `https://moramerch.s3.eu-north-1.amazonaws.com/myfiles/${filename}`
        });
    } catch (error) {
        console.error("Error uploading file to S3", error);
        res.status(500).send("Error uploading file to S3");
    }
});


// //photo upload
// app.get('/upload', async (req, res) =>{
//     let url = await putObject("test.mp4", "video/mp4");
//     console.log(url);
// })

// Image Storage Engine

// const storage = multer.diskStorage({
//     destination: './upload/images',
//     filename:(req, file, cb)=>{
//         return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
//     }
// })

// const upload = multer({storage:storage})

//Creating Upload Endpoint for images

// app.use('/images',express.static('upload/images'))

// app.post("/upload", upload.single('product'),(req,res)=>{
//     res.json({
//         success:1,
//         image_url: `http://localhost:${port}/images/${req.file.filename}`
//     })
// })

// Schema for Creating Products

const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: [String], // Store an array of image URLs as strings
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    categoryFor: {
        type: [String],
        required: true,
    },
    new_price: {
        type: Number,
    },
    old_price: {
        type: Number,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
    description: {
        type: String,
    },
    rating: {
        type: Number,
    },
    reviewText: {
        type: [String],
    },
    no_of_rators: {
        type: Number,
    },
});

app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product_array = products.slice(-1);
        let last_product = last_product_array[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }

    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image, // Assuming this is an array of image URLs
        category: req.body.category,
        categoryFor: req.body.categoryFor,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
        description: req.body.description,
        rating: req.body.rating,
        reviewText: req.body.reviewText,
        no_of_rators: req.body.no_of_rators,
    });

    console.log(product);
    await product.save();
    console.log("Product Saved");
    res.json({
        success: true,
        name: req.body.name,
    });
});

// Creating API for deleting products

app.post('/removeproduct', async(req, res)=>{
    await Product.findOneAndDelete({id:req.body.id});
    console.log("Removed");
    res.json({
        success:true,
        name:req.body.name
    })
})

//creating endpoint for getting related products
app.post('/getrelatedproducts', async (req,res)=>{
    let products = await Product.find({category:req.body.category});
    let related_products = products.slice(-4).reverse();
    console.log("Related products fetched");
    res.send(related_products);
})
//creating API for set available or not
app.post('/setavailablestate',async (req,res)=>{
    console.log("AvailableStateAdded",req.body.itemId);
    let currentProduct = await Product.findOne({id:req.body.itemId});
    currentProduct.available = req.body.available;   
    await Product.findOneAndUpdate({id:req.body.itemId},{available:currentProduct.available});
    res.send("AvailableStateAdded")
})

//creating API for set reviews and ratings
app.post('/addreview',async (req,res)=>{
    console.log("reviewAdded",req.body.itemId);
    let currentProduct = await Product.findOne({id:req.body.itemId});
    currentProduct.reviewText[currentProduct.no_of_rators+1].text = req.body.text;   
    currentProduct.reviewText[currentProduct.no_of_rators+1].name = req.body.name;
    currentProduct.reviewText[currentProduct.no_of_rators+1].profilephoto = req.body.profilephoto;
    currentProduct.reviewText[currentProduct.no_of_rators+1].rating = req.body.rating;    
    currentProduct.rating = (currentProduct.rating * currentProduct.no_of_rators + req.body.rating) / (currentProduct.no_of_rators + 1);                  //.push(req.body.review);
    currentProduct.no_of_rators += 1;
    
    await Product.findOneAndUpdate({id:req.body.itemId},{reviewText:currentProduct.reviewText, no_of_rators:currentProduct.no_of_rators, rating:currentProduct.rating});
    res.send("reviewAdded")
})

app.post('/addrating',async (req,res)=>{
    console.log("ratingAdded",req.body.itemId);
    let currentProduct = await Product.findOne({id:req.body.itemId});
    currentProduct.rating = req.body.rating;
    currentProduct.no_of_rators += 1;
    await Product.findOneAndUpdate({id:req.body.itemId},{rating:currentProduct.rating, no_of_rators:currentProduct.no_of_rators});
    res.send("ratingAdded")
})



// Creating API for getting all products

app.get('/allproducts',async (req, res)=>{
    let products = await Product.find({});
    products = products.reverse();
    console.log("All Products Fetched");
    res.send(products);
})

// Shema creating for User model

// const Users = mongoose.model('Users', {
//     email:{
//         type:String,
//     },
//     name:{
//         type:String,
//     },
//     password:{
//         type:String,
//     },
//     cartData:{
//         type:Object,
//     },
//     date:{
//         type:Date,
//         default:Date.now,
//     },
//     index:{
//         type:String,
//         required:true,
//     },
//     faculty:{
//         type:String,
//         required:true,
//     },
//     department:{
//         type:String,
//         required:true,
//     },
//     batch:{
//         type:String,
//         required:true,
//     },
//     profile_pic:{
//         type:String,
//     },
//     isVerified:{
//         type:Boolean,
//         default:false,
//     }
// })



// creating endpoint for registering user
// app.post('/signup', async(req, res)=>{

//     let users = await Users.find({});
//     let id;
//     if(users.length>0)
//     {
//         id = users.length+1;
//     }
//     else{
//         id=1;
//     }

//     let check = await Users.findOne({email:req.body.email});
//     let check1 = await Users.findOne({name:req.body.name});
//     let check2 = await Users.findOne({password:req.body.password});
//     let check3 = await Users.findOne({index:req.body.index});
    
//     if(check){
//         return res.status(400).json({success:false,errors:"existing user found with same email address."})
//     }
//     if(check1){
//         return res.status(400).json({success:false,errors:"existing user found with same username. enter your full name."})
//     }
//     if(check2){
//         return res.status(400).json({success:false,errors:"try another password."})
//     }
//     if(check3){
//         return res.status(400).json({success:false,errors:"existing user found with same index. please contact via whatsApp."})
//     }
//     let cart =[];
//     for(let i =0; i < 300; i++){
//         let q = 0;
//         let size =[];
//         let color =[];
//         cart.push({
//             q,
//             size,
//             color,
//         })
//     }
//     const user = new Users({
//         name: req.body.username,
//         email: String(id),
//         password: req.body.password,
//         cartData: cart,
//         index: req.body.index,
//         faculty: req.body.faculty,
//         department: req.body.department,
//         batch: req.body.batch,
//         profile_pic: req.body.profile_pic,
//         isVerified: false,
//     });

    // const token = jwt.sign({ user: userData }, 'secret_ecom', { expiresIn: '1h' });

    // await user.save();

    // const data = {
    //     user:{
    //         id:user.id,
    //         email:req.body.email
    //     }
    // }
    // const token = jwt.sign(data, 'secret_ecom', { expiresIn: '24h' });
    // res.json({success:true,token})

    /** send mail to user */
    // let testAccount = await nodemailer.createTestAccount();
    // let config = {
    //     service : 'gmail',
    //     auth : {
    //         user: process.env.EMAIL,
    //         pass: process.env.PASSWORD
    //     }
    // }

    // const transporter = nodemailer.createTransport({
    //     host: "smtp.ethereal.email",
    //     port: 587,
    //     secure: false, // Use `true` for port 465, `false` for all other ports
    //     auth: {
    //       user: testAccount.user,
    //       pass: testAccount.pass,
    //     },
    //   });

    // const transporter = nodemailer.createTransport(config);
    // const verificationUrl = `https://moramerc.lk/verify-email?token=${token}`;


    // let message = {
    // from: 'MORAMERC', // sender address
    // to: req.body.email, // list of receivers
    // subject: "Register for MORAMERC", // Subject line
    // text: `Please verify your email by clicking on the following link: ${verificationUrl}`,
    // html: `Please verify your email by clicking on the following link: <a href="${verificationUrl}">${verificationUrl}</a>`,
    // }

    // transporter.sendMail(message, (err, info) => {
    //     if (err) {
    //         console.error('Error sending email', err);
    //         return res.status(500).json({ success: false, errors: 'Error sending verification email' });
    //     } else {
    //         console.log('Verification email sent', info.response);
    //         res.json({ success: true, token });
    //     }
    // });
    // .then(()=>{
    // const token = jwt.sign(data, 'secret_ecom');
    // return res.status(201).json({ 
    //     msg: "you should raceive an email", 
    //     success:true,
    //     token,
    // })
    // }).catch(error => {
    // return res.status(500).json({error})
    // })

    /** end of sending mail  */

    
// })

// app.get('/verify-email', async (req, res) => {
//     const token = req.query.token;

//     if (!token) {
//         console.log('Invalid or missing token');
//         return res.status(400).json({ error: 'Invalid or missing token' });
//     }

//     try {
//         const decoded = jwt.verify(token, 'secret_ecom');
//         const user = await Users.findById(decoded.user.id);
//         if (!user) {
//             console.log('User not found');
//             return res.status(400).json({ error: 'User not found' });
//         }

//         user.isVerified = true;
//         user.email = decoded.user.email;
//         await user.save();
//         console.log('Email verified successfully!');
//         res.status(200).json({ message: 'Email verified successfully!' });
//     } catch (err) {
//         console.log('Invalid or expired token');
//         return res.status(400).json({ error: 'Invalid or expired token' });
//     }
// });


///////////////////////////////////////////////////////////
// Creating API for getting all users

// app.get('/allusers',async (req, res)=>{
//     let users = await Users.find({});
//     console.log("All Users Fetched");
//     res.send(users);
// })

// Creating API for remove user

// app.post('/removeuser', async(req, res)=>{
//     await Users.findOneAndDelete({email:req.body.email});
//     console.log("User Removed");
//     res.json({
//         success:true,
//         email:req.body.email
//     })
// })


////////////////////////////////////////////////////////////////////

// creating endpoint for user login

// app.post('/login',async (req, res)=>{
//     let user = await Users.findOne({email:req.body.email});
//     if(user){
//         const passCompare = req.body.password===user.password;
//         if(passCompare && user.isVerified){
//             const data = {
//                 user:{
//                     id:user.id
//                 }
//             }
//             const token = jwt.sign(data,'secret_ecom');
//             res.json({success:true,token});
//         }
//         else{
//             res.json({success:false, errors:"Wrong Email or Password"});
//         }
//     }
//     else{
//         res.json({success:false, errors:"Wrong Email or Password"})
//     }
// })

//creating endpoint for newcollection data
app.get('/newcollections', async (req, res)=>{
    let products = await Product.find({});

    let newcollection = products.slice(-8).reverse();
    console.log("NewCollection Fetched");
    res.send(newcollection);
})

//creating endpoint for popular in mora section
app.get('/featureproducts', async (req,res)=>{
    let products = await Product.find({category:'t-shirts'});
    let popular_in_mora = products.slice(-4).reverse();
    console.log("Feature products fetched");
    res.send(popular_in_mora);
})

// creating middelware to fetch user
    // const fetchUser = async (req,res,next)=>{
    //     const token = req.header('auth-token');
    //     if(!token){
    //         res.status(401).send({errors:"Please authenticate using valid token"})
    //     }
    //     else{
    //         try{
    //             const data = jwt.verify(token,'secret_ecom');
    //             req.user = data.user;
    //             next();
    //         }catch(error){
    //             res.status(401).send({errors:"Please authenticate using valid token"})
    //         }
    //     }
    // }

//creating endpoint for adding products in cartdata
// app.post('/addtocart',fetchUser,async (req,res)=>{
//     console.log("added",req.body.itemId);
//     let userData = await Users.findOne({_id:req.user.id});
//     userData.cartData[req.body.itemId].q +=1;
//     userData.cartData[req.body.itemId].size.push(req.body.sizeId);
//     userData.cartData[req.body.itemId].color.push(req.body.colorId);
//     await Users.findByIdAndUpdate({_id:req.user.id},{cartData:userData.cartData});
//     res.send("Added")
// })

//creating end point for add profile photo
// app.post('/addprofilephoto',fetchUser,async (req,res)=>{
//     console.log("dpAdded",req.body.itemId);
//     let currentUser = await Users.findOne({_id:req.user.id});
//     currentUser.profile_pic = req.body.profile_pic;
//     await Users.findByIdAndUpdate({_id:req.user.id},{profile_pic:currentUser.profile_pic});
//     res.send("dpAdded")
// })

//creating endpoint for change password
// app.post('/changepassword',fetchUser,async (req,res)=>{
//     console.log("changed");
//     let userData = await Users.findOne({_id:req.user.id});
//     userData.password = req.body.password;
//     await Users.findByIdAndUpdate({_id:req.user.id},{password:userData.password});
//     res.send({success:true})
// })


//creating end point to remove product from cartdata
// app.post('/removefromcart',fetchUser,async (req,res)=>{
//     console.log("removed",req.body.itemId);
//     let userData = await Users.findOne({_id:req.user.id});
//     if(userData.cartData[req.body.itemId].q>0)
//     userData.cartData[req.body.itemId].q -=1;
//     delete userData.cartData[req.body.itemId].size[req.body.sizeId];
//     delete userData.cartData[req.body.itemId].color[req.body.sizeId];//both are equal positions
//     await Users.findByIdAndUpdate({_id:req.user.id},{cartData:userData.cartData});
//     res.send("Removed")
// })
//////////////////////////////////////////////////////////////////////////////////////////////////

//creating end point to remove all  products from cartdata
// app.post('/removeallfromcart',fetchUser,async (req,res)=>{
//     console.log("Allremoved",req.body.itemId);
//     let userData = await Users.findOne({_id:req.user.id});
//     if(userData.cartData[req.body.itemId].q>0)
//     userData.cartData[req.body.itemId].q =0;
//     userData.cartData[req.body.itemId].size =[];
//     userData.cartData[req.body.itemId].color =[];
//     await Users.findByIdAndUpdate({_id:req.user.id},{cartData:userData.cartData});
//     res.send("Removed")
// })

////////////////////////////////////////////////////////////////////////////////////////////////////

//creating endpoint to get cart data
// app.post('/getcart',fetchUser,async (req,res)=>{
//     console.log("GetCart");
//     let userData = await Users.findOne({_id:req.user.id});
//     if(userData){
//         res.json(userData.cartData);
//     }
// })

///////////////////////////////////////////////////////////////

//creating API for get user

// app.post('/getuser',fetchUser,async (req,res)=>{
//     console.log("GetUser");
//     let userEmail = await Users.findOne({_id:req.user.id});
//     res.json(userEmail.email);
// })

//creating API for get user by email///////////////////////////////////////////////////////////////////////////////////////////

// app.post('/getuserbymail', fetchUser, async (req, res) => {
//     console.log("GetUser By Mail");
//     // Use projection to exclude the password field from the result
//     let user = await Users.findOne({_id:req.user.id}, {password: 0});
//     res.json(user);
// });

// Image Storage Engine for slips


// const storage_slip = multer.memoryStorage();
// const upload_slip = multer({ storage: storage_slip });

// Creating upload endpoint for images
// app.post("/slipupload", upload_slip.single('order'), async (req, res) => {
//     const file = req.file;
//     if (!file) {
//         return res.status(400).send("No file uploaded.");
//     }

//     const filename = `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`;
//     const contentType = file.mimetype;

//     try {
//         const url = await getPutObjectSignedUrl2(filename, contentType);
//         // Here you would typically upload the file to S3 using the signed URL.
//         // This is a simplified example:
//         const uploadParams = {
//             Bucket: "moramerch",
//             Key: `slipfiles/${filename}`,
//             Body: file.buffer,
//             ContentType: contentType,
//         };
//         await s2Client.send(new PutObjectCommand(uploadParams));

//         res.json({
//             success: 1,
//             image_url: `https://moramerch.s3.eu-north-1.amazonaws.com/slipfiles/${filename}`
//         });
//     } catch (error) {
//         console.error("Error uploading file to S3", error);
//         res.status(500).send("Error uploading file to S3");
//     }
// });






// const storage_slip = multer.diskStorage({
//     destination: './slipupload/slipimages',
//     filename:(req, file, cb)=>{
//         return cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)

//     }
// })

// const upload_slip = multer({storage:storage_slip})

//Creating Upload Endpoint for slip images

// app.use('/slipimages',express.static('slipupload/slipimages'))

// app.post("/slipupload", upload_slip.single('order'),(req,res)=>{
//     res.json({
//         success:1,
//         image_url: `http://localhost:${port}/slipimages/${req.file.filename}`
//     })
// })

// schema for creating Orders

const Order = mongoose.model("Order",{
    id:{
        type: Number,
        required: true,
    },
    uder_id:{
        type: String,//this is email of the user
        required:true,
    },
    num_purchase_products:{
        type: Number,
        required: true,
    },
    whatsApp:{
        type:String,
        required: true,
    },
    phoneNumber:{
        type:String,
        required: true,
    },
    product_id:{
        type:[String],
        required:true,
    },
    date:{
        type:Date,
        default:Date.now,
    },
    time:{
        type:String,
        default: () => new Date().toLocaleTimeString(),
    },
    total:{
        type:Number,
        required: true,
    },
    username:{
        type:String,
        required:true,
    },
    houseNumber:{
        type:String,
    },
    addressLine1:{
        type:String,
    },
    addressLine2:{
        type:String,
    },
    city:{
        type:String,
    },
    district:{
        type:String,
    },
    province:{
        type:String,
    },
    postalCode:{
        type:String,
    },
})

 

app.post('/orderconfirmation', async (req,res)=>{
    let orders = await Order.find({});
    let id;
    if(orders.length>0)
    {
        let last_order_array = orders.slice(-1);
        let last_order = last_order_array[0];
        id = last_order.id+1;
    }
    else{
        id=1;
    }
    const order = new Order({
        id:id,
        uder_id:req.body.uder_id,
        num_purchase_products:req.body.num_purchase_products,
        whatsApp:req.body.whatsApp,
        phoneNumber:req.body.phoneNumber,
        product_id:req.body.product_id,
        total:req.body.total,
        username:req.body.username,
        houseNumber:req.body.houseNumber,
        addressLine1:req.body.addressLine1,
        addressLine2:req.body.addressLine2,
        city:req.body.city,
        district:req.body.district,
        province:req.body.province,
        postalCode:req.body.postalCode
    });
    console.log(order);
    await order.save();
    console.log("Saved");
    res.json({
        success:true,
        user_id:req.body.uder_id,
    });

    /** sent a mail when order */

    let config = {
        service:'gmail',
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD
        }
    }
    let transporter = nodemailer.createTransport(config);

    let MailGenerator = new Mailgen({
        theme:'default',
        product:{
            name:'Poo Poo Shop',
            link: 'https://mailgen.js/'
        }
    })

    let desc = 'You have order '+req.body.num_purchase_products+" "+req.body.productname;

    let response = {
        body:{
          name:req.body.username,
          intro:  "Your bill has arrived!",
          table: {
            data:[
                {
                    item: req.body.productname,
                    description: desc,
                    price : req.body.total,
                }
            ]
          },
          outro: 'Thank you for ordering from us!'
        }
    }

    let mail = MailGenerator.generate(response)

    let message = {
        from : process.env.EMAIL,
        to : req.body.uder_id,
        subject : 'Place your Order',
        html: mail
    }

    transporter.sendMail(message);
    // .then(()=>{
    //     return res.status(200).json({
    //         mas:"You should recieve an email",
    //         success:true,
    //         user_id:req.body.uder_id,
    //     })
    // }).catch(error => {
    //     return res.status(500).json({ error});
    // });
    /** end of mail */
    
    
})

//creating endpoint for getting orders by product id
//shold pass product id in request
app.post('/getordersusingid', async (req,res)=>{
    let orders = await Order.find({product_id:req.body.product_id});
    console.log("Get that product orders");
    res.json(orders);
})

//creating endpoint for getting orders of a user
app.post('/getordersofuser', async (req,res)=>{
    let orders = await Order.find({uder_id:req.body.uder_id});
    console.log("Get that user's order");
    res.json(orders);
})

// Creating API for deleting orders by product id

app.post('/removeorder', async(req, res)=>{
    let orders = await Order.find({product_id:req.body.product_id});
    for(i=0;i<orders.length;i++){
        await Order.findOneAndDelete({product_id:req.body.product_id});
    }
    console.log("Removed");
    res.json({
        success:true,
        product_id:req.body.product_id
    })
})


///////////////////////////////////////////////////////////////////////////////////////////////

const Advertisements = mongoose.model("Adverticements", {
    adid:{
        type: String,
        required: true,
    },
    ad_image:{
        type: String,
    },
    ad_category:{
        type: String,
    }
})

app.post('/addAdertisement', async(req, res)=>{

    let adds = await Advertisements.find({});
    let id;
    if(adds.length>0)
    {
        let last_add_array = adds.slice(-1);
        let last_add = last_add_array[0];
        id = last_add.id+1;
    }
    else{
        id=1;
    }

    const add = new Advertisements({
        adid:id,
        ad_image:req.body.ad_image,
        ad_category: req.body.ad_category,
    })

    await add.save();

    res.json({
        success:true,
        name:req.body.name,
    });
})

//creating endpoint for get all advertisements

app.get('/alladvertisements',async (req, res)=>{
    let adds = await Advertisements.find({});
    adds = adds.reverse();
    console.log("All Advertisements Fetched");
    res.send(adds);
})

// Mongoose model for FundRaising
// const FundRaising = mongoose.model("FundRaising", {
//     amount: {
//         type: Number,
//         default: 0,
//     },
//     donators: {
//         type: Number,
//         default: 0,
//     },
// });

// API to get the FundRaising document
// app.get('/fundraising123', async (req, res) => {
//     try {
//         const fundraising = await FundRaising.findOne(); // Assuming there's only one document
//         if (!fundraising) {
//             return res.status(404).send('FundRaising document not found');
//         }
//         res.json(fundraising);
//     } catch (error) {
//         res.status(500).send(error.toString());
//     }
// });

// API to update the FundRaising document
// app.post('/fundraising123', async (req, res) => {
//     const { amount, donators } = req.body;
//     try {
//         // Assuming there's only one document, so we use findOneAndUpdate with an empty filter
//         const updatedFundRaising = await FundRaising.findOneAndUpdate({}, { $set: { amount, donators } }, { new: true, upsert: true }); // upsert: true creates the document if it doesn't exist
//         res.json({
//             success:true,
//         });
//     } catch (error) {
//         res.status(500).send(error.toString());
//     }
// });

app.listen(port, (error)=>{
    if(!error){
        console.log("Server Running on Port ",port)
    }
    else{
        console.log("Error : ",error)
    }
})
