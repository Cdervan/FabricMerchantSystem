const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')
const NodeCouchDb = require('node-couchdb')
const { response } = require('express')
const { send } = require('process')
require("dotenv").config()

const PORT = process.env.PORT || 3001;
const fabricBaseURL = process.env.FABRIC_BASEURL
const fabricTransferURL = process.env.FABRIC_TRANSFERURL
const dbname = process.env.DBNAME
const viewURL = process.env.DB_VIEWURL

const TO = 'merchant'

const couch = new NodeCouchDb({
    host: process.env.COUCH_HOST,
    port: process.env.COUCH_PORT,
    auth: {
        user: process.env.COUCH_USER,
        pass: process.env.COUCH_PASS
    }
})

couch.listDatabases().then(function(dbs){
    console.log(dbs)
})

const app = express()

// view engine middleware
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

//body parser middleware
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended:false}))

const logger = (req, res, next) => {
    console.log(`${req.protocol}://${req.get('host')}${req.originalUrl}`)
    console.log(__dirname)
    next()
}

app.get('/', function(req, res){ 

    couch.get(dbname, viewURL).then(
        function(data, headers, status){
            // console.log(data.data.rows)
            
            res.render('index',{
                transactions:data.data.rows
            })
        },
        function(err){
            res.send(err)
        }
    )
},
function(err){
    res.send(err)
})

// check fabric to see if user and funds exist
const getBalance = async function(name) {
    
    let fabricResponse = await fetch(fabricBaseURL + 'GetAccountBalance', {
        method: "POST",
        body: JSON.stringify({
            fabricUserName: name
        }),
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    })
    let bal = await fabricResponse.text()

    if(bal === 'Wallet does not exist'){
        // console.log(`${bal}, Please enter a valid fabric user name`)
        return
    }
    console.log(`User ${name} has a balance of ${bal}`)
    let balanceInt = parseInt(bal, 10)
    // if(price > balanceInt){
    //     console.log(`User ${name} does not have enough funds to complete transaction`)
    //     return
    // }
    return balanceInt;
}

const makeTransfer = async function(sender, amount) {

    let fabricTransferResponse = await fetch(fabricTransferURL + 'RequestTransfer', {
        method: "POST",
        body: JSON.stringify({
            fabricUserName: sender,
            to: TO,
            value: parseInt(amount)
        }),
        headers: {
            "Content-type": "application/json; charset=UTF-8"
        }
    })

    let transferResponse = await fabricTransferResponse.json()
    console.log(transferResponse)
    return transferResponse
}

// Grab user input from index.ejs
app.post('/', async (req, res) => {
    const name = await req.body.inputFabricUserName;
    console.log(name);
    getBalance(name)
    res.redirect('/');
}, (err) => {
    res.send(err);
})

app.post('/transactions/add', async (req, res) => {
    const name = req.body.name
    const wAddress = req.body.wAddress
    const price = req.body.price
    const tx_id = req.body.tx_id
    const timestamp = req.body.timestamp
    const location = req.body.location

    let balance = await getBalance(name)
    console.log(`Balance before transaction: $${balance}`)

    // error handling
    if(balance === undefined){
        console.log(`Wallet ${name} does not exist`)
        res.redirect('/')
        return
    }
    if(price > balance) {
        console.log(`User ${name} does not have enough funds to complete transaction`)
        res.redirect('/')
        return
    }
    
    const transfer = await makeTransfer(name, price)
    balance = await getBalance(name)
    console.log(`Success ${name} has spent ${price} unit, and now has ${balance} unit`)

    couch.uniqid().then(function(ids){
        const id = ids[0]

        couch.insert('transactions', {
            _id: id,
            name: name,
            wAddress: wAddress,
            tx_amount: price,
            tx_id: tx_id,
            timestamp: timestamp,
            location: location
        }).then(
            (data, headers, status) => {
                res.redirect('/')
            },
            (err) => {
                res.send(err)
            }
        )
    })
},
(err) => {
    res.send(err)
})

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`)
})