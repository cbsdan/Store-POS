let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("nedb");
let Inventory = require("./inventory");

app.use(bodyParser.json());

module.exports = app;

const STATUS = {
  HOLD: 0,
  PAID: 1,
  VOIDED: 2,
  REFUNDED: 3
};

const SERIAL_TYPES = {
  INVOICE: "invoice",
  REFUND: "refund"
};

const SERIAL_CONFIG = {
  invoice: { docId: "SERIAL_INVOICE", prefix: "INV" },
  refund: { docId: "SERIAL_REFUND", prefix: "RFND" }
};

let transactionsDB = new Datastore({
  filename: process.env.APPDATA + "/POS/server/databases/transactions.db",
  autoload: true
});

let serialDB = new Datastore({
  filename: process.env.APPDATA + "/POS/server/databases/serials.db",
  autoload: true
});

let auditDB = new Datastore({
  filename: process.env.APPDATA + "/POS/server/databases/audit_logs.db",
  autoload: true
});

transactionsDB.ensureIndex({ fieldName: "_id", unique: true });
transactionsDB.ensureIndex({ fieldName: "order", unique: true, sparse: true });
serialDB.ensureIndex({ fieldName: "_id", unique: true });
auditDB.ensureIndex({ fieldName: "_id", unique: true });
auditDB.ensureIndex({ fieldName: "date" });

function nowISO() {
  return new Date().toJSON();
}

function toNumber(value, fallback) {
  let parsed = parseFloat(value);
  if (isNaN(parsed)) return fallback;
  return parsed;
}

function normalizeStatus(value, fallback) {
  let parsed = parseInt(value, 10);
  if (isNaN(parsed)) return fallback;
  return parsed;
}

function normalizeId(value) {
  if (value === undefined || value === null) return value;
  let asString = String(value).trim();
  if (/^\d+$/.test(asString)) return parseInt(asString, 10);
  return asString;
}

function buildDateRangeISO(startRaw, endRaw) {
  let start = new Date(startRaw);
  let end = new Date(endRaw);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return null;
  }

  return {
    startISO: start.toJSON(),
    endISO: end.toJSON()
  };
}

function buildByDateQuery(query) {
  let andFilters = [];
  let dateRange = buildDateRangeISO(query.start, query.end);

  if (dateRange) {
    andFilters.push({
      date: { $gte: dateRange.startISO, $lte: dateRange.endISO }
    });
  }

  let status = normalizeStatus(query.status, -1);
  if (status >= 0) {
    andFilters.push({ status: status });
  }

  let user = normalizeStatus(query.user, 0);
  if (user !== 0) {
    andFilters.push({ user_id: user });
  }

  let till = normalizeStatus(query.till, 0);
  if (till !== 0) {
    andFilters.push({ till: till });
  }

  if (andFilters.length === 0) return {};
  return { $and: andFilters };
}

function createAuditLog(action, details, callback) {
  let log = {
    _id: "AUD-" + Date.now() + "-" + Math.floor(Math.random() * 1000000),
    date: nowISO(),
    action: action,
    details: details || {}
  };

  auditDB.insert(log, function (err) {
    if (callback) callback(err, log);
  });
}

function getNextSerial(type, callback) {
  let serialType = type === SERIAL_TYPES.REFUND ? SERIAL_TYPES.REFUND : SERIAL_TYPES.INVOICE;
  let config = SERIAL_CONFIG[serialType];

  serialDB.findOne({ _id: config.docId }, function (findErr, serialDoc) {
    if (findErr) return callback(findErr);

    let current = serialDoc ? normalizeStatus(serialDoc.last, 0) : 0;
    let next = current + 1;
    let serial = config.prefix + "-" + String(next).padStart(8, "0");
    let payload = {
      _id: config.docId,
      type: serialType,
      prefix: config.prefix,
      last: next,
      last_serial: serial,
      updated_at: nowISO()
    };

    serialDB.update({ _id: config.docId }, payload, { upsert: true }, function (updateErr) {
      if (updateErr) return callback(updateErr);
      callback(null, { serial: serial, sequence: next, prefix: config.prefix, type: serialType });
    });
  });
}

function parseInvoiceSequence(orderValue) {
  let match = /^INV-(\d{8})$/.exec(String(orderValue || ""));
  if (!match) return null;
  return parseInt(match[1], 10);
}

function validateReservedInvoiceSerial(orderValue, callback) {
  let sequence = parseInvoiceSequence(orderValue);
  if (!sequence) {
    let err = new Error("Invalid invoice serial format.");
    err.statusCode = 422;
    return callback(err);
  }

  serialDB.findOne({ _id: SERIAL_CONFIG[SERIAL_TYPES.INVOICE].docId }, function (findErr, serialDoc) {
    if (findErr) return callback(findErr);

    let currentLast = serialDoc ? normalizeStatus(serialDoc.last, 0) : 0;
    if (sequence > currentLast) {
      let err = new Error("Invoice serial is not reserved by the system.");
      err.statusCode = 422;
      return callback(err);
    }

    callback(null);
  });
}

function ensureInvoiceSerial(transaction, callback) {
  let status = normalizeStatus(transaction.status, STATUS.HOLD);
  let currentOrder = String(transaction.order || "");
  let hasInvoiceSerial = /^INV-\d{8}$/.test(currentOrder);

  if (status !== STATUS.PAID) {
    return callback(null, transaction);
  }

  if (hasInvoiceSerial) {
    return validateReservedInvoiceSerial(currentOrder, function (validationErr) {
      if (validationErr) return callback(validationErr);
      callback(null, transaction);
    });
  }

  getNextSerial(SERIAL_TYPES.INVOICE, function (err, serialData) {
    if (err) return callback(err);
    transaction.order = serialData.serial;
    transaction.invoice_sequence = serialData.sequence;
    callback(null, transaction);
  });
}

function isPaidEnough(transaction) {
  let paidAmount = toNumber(transaction.paid, 0);
  let totalAmount = toNumber(transaction.total, 0);
  return paidAmount >= totalAmount;
}

app.get("/", function (req, res) {
  res.send("Transactions API");
});

app.get("/serial/next", function (req, res) {
  let type = req.query.type === SERIAL_TYPES.REFUND ? SERIAL_TYPES.REFUND : SERIAL_TYPES.INVOICE;

  getNextSerial(type, function (err, data) {
    if (err) return res.status(500).send(err);
    res.send(data);
  });
});

app.get("/all", function (req, res) {
  transactionsDB.find({}).sort({ date: -1 }).exec(function (err, docs) {
    if (err) return res.status(500).send(err);
    res.send(docs || []);
  });
});

app.get("/on-hold", function (req, res) {
  transactionsDB.find(
    { $and: [{ ref_number: { $ne: "" } }, { status: STATUS.HOLD }] },
    function (err, docs) {
      if (err) return res.status(500).send(err);
      res.send(docs || []);
    }
  );
});

app.get("/customer-orders", function (req, res) {
  transactionsDB.find(
    { $and: [{ customer: { $ne: 0 } }, { status: STATUS.HOLD }, { ref_number: "" }] },
    function (err, docs) {
      if (err) return res.status(500).send(err);
      res.send(docs || []);
    }
  );
});

app.get("/by-date", function (req, res) {
  let query = buildByDateQuery(req.query);

  transactionsDB.find(query).sort({ date: -1 }).exec(function (err, docs) {
    if (err) return res.status(500).send(err);
    res.send(docs || []);
  });
});

app.get("/audit/by-date", function (req, res) {
  let query = {};
  let dateRange = buildDateRangeISO(req.query.start, req.query.end);
  let action = String(req.query.action || "").trim();

  if (dateRange) {
    query.date = { $gte: dateRange.startISO, $lte: dateRange.endISO };
  }

  if (action !== "") {
    query.action = action;
  }

  auditDB
    .find(query)
    .sort({ date: -1 })
    .exec(function (err, logs) {
      if (err) return res.status(500).send(err);
      res.send(logs || []);
    });
});

app.get("/compliance/report", function (req, res) {
  let transactionQuery = buildByDateQuery({
    start: req.query.start,
    end: req.query.end,
    status: -1,
    user: req.query.user || 0,
    till: req.query.till || 0
  });

  let auditQuery = {};
  let dateRange = buildDateRangeISO(req.query.start, req.query.end);
  if (dateRange) {
    auditQuery.date = { $gte: dateRange.startISO, $lte: dateRange.endISO };
  }

  transactionsDB.find(transactionQuery).sort({ date: 1 }).exec(function (txErr, transactions) {
    if (txErr) return res.status(500).send(txErr);

    auditDB.find(auditQuery).sort({ date: 1 }).exec(function (auditErr, logs) {
      if (auditErr) return res.status(500).send(auditErr);

      serialDB.find({}).sort({ updated_at: -1 }).exec(function (serialErr, serialDocs) {
        if (serialErr) return res.status(500).send(serialErr);

        let summary = {
          hold_transactions: 0,
          paid_transactions: 0,
          voided_transactions: 0,
          refunded_transactions: 0,
          paid_sales_amount: 0,
          voided_sales_amount: 0,
          refunded_sales_amount: 0,
          net_sales_amount: 0,
          paid_vat_amount: 0,
          refunded_vat_amount: 0,
          net_vat_amount: 0
        };

        let invoiceSerials = [];
        let refundSerials = [];

        (transactions || []).forEach(function (txn) {
          let status = normalizeStatus(txn.status, STATUS.HOLD);
          let total = toNumber(txn.total, 0);
          let vat = toNumber(txn.tax, 0);
          let orderNumber = String(txn.order || "");
          let refundRef = String(txn.refund_reference || "");

          if (/^INV-\d{8}$/.test(orderNumber)) invoiceSerials.push(orderNumber);
          if (/^RFND-\d{8}$/.test(refundRef)) refundSerials.push(refundRef);

          if (status === STATUS.HOLD) summary.hold_transactions += 1;
          if (status === STATUS.PAID) {
            summary.paid_transactions += 1;
            summary.paid_sales_amount += total;
            summary.paid_vat_amount += vat;
          }
          if (status === STATUS.VOIDED) {
            summary.voided_transactions += 1;
            summary.voided_sales_amount += total;
          }
          if (status === STATUS.REFUNDED) {
            summary.refunded_transactions += 1;
            summary.refunded_sales_amount += total;
            summary.refunded_vat_amount += vat;
          }
        });

        summary.net_sales_amount = summary.paid_sales_amount - summary.refunded_sales_amount;
        summary.net_vat_amount = summary.paid_vat_amount - summary.refunded_vat_amount;

        Object.keys(summary).forEach(function (key) {
          if (typeof summary[key] === "number") {
            summary[key] = parseFloat(summary[key].toFixed(2));
          }
        });

        invoiceSerials.sort();
        refundSerials.sort();

        res.send({
          generated_at: nowISO(),
          criteria: {
            start: req.query.start || "",
            end: req.query.end || "",
            user: req.query.user || "0",
            till: req.query.till || "0"
          },
          summary: summary,
          serial_ranges: {
            invoice_first: invoiceSerials[0] || "",
            invoice_last: invoiceSerials.length > 0 ? invoiceSerials[invoiceSerials.length - 1] : "",
            refund_first: refundSerials[0] || "",
            refund_last: refundSerials.length > 0 ? refundSerials[refundSerials.length - 1] : ""
          },
          transactions: transactions || [],
          audit_logs: logs || [],
          serial_registry: serialDocs || []
        });
      });
    });
  });
});

app.post("/new", function (req, res) {
  let newTransaction = req.body || {};

  newTransaction._id = normalizeId(newTransaction._id || Date.now());
  newTransaction.status = normalizeStatus(newTransaction.status, STATUS.HOLD);
  newTransaction.date = newTransaction.date || nowISO();
  if (!Array.isArray(newTransaction.items)) newTransaction.items = [];

  if (newTransaction.status !== STATUS.HOLD && newTransaction.status !== STATUS.PAID) {
    return res.status(422).send({ message: "Invalid status for new transaction." });
  }

  ensureInvoiceSerial(newTransaction, function (serialErr, preparedTransaction) {
    if (serialErr) {
      if (serialErr.statusCode) {
        return res.status(serialErr.statusCode).send({ message: serialErr.message });
      }
      return res.status(500).send(serialErr);
    }

    transactionsDB.insert(preparedTransaction, function (insertErr, transaction) {
      if (insertErr) return res.status(500).send(insertErr);

      if (normalizeStatus(transaction.status, STATUS.HOLD) === STATUS.PAID && isPaidEnough(transaction)) {
        Inventory.decrementInventory(transaction.items);
      }

      createAuditLog("TRANSACTION_CREATED", {
        transaction_id: transaction._id,
        order: transaction.order,
        status: transaction.status,
        total: transaction.total,
        user: transaction.user || "",
        user_id: transaction.user_id || "",
        till: transaction.till || "",
        mac: transaction.mac || ""
      });

      res.send(transaction);
    });
  });
});

app.put("/new", function (req, res) {
  let orderId = normalizeId(req.body._id);
  if (orderId === undefined || orderId === null || orderId === "") {
    return res.status(400).send({ message: "Order ID is required." });
  }

  transactionsDB.findOne({ _id: orderId }, function (findErr, existingTransaction) {
    if (findErr) return res.status(500).send(findErr);
    if (!existingTransaction) return res.status(404).send({ message: "Transaction not found." });

    let existingStatus = normalizeStatus(existingTransaction.status, STATUS.HOLD);
    if (existingStatus !== STATUS.HOLD) {
      return res.status(403).send({ message: "Finalized transactions are immutable. Use void/refund controls instead." });
    }

    let updatedTransaction = Object.assign({}, existingTransaction, req.body || {});
    updatedTransaction._id = existingTransaction._id;
    updatedTransaction.status = normalizeStatus(updatedTransaction.status, existingStatus);
    updatedTransaction.updated_at = nowISO();
    if (!Array.isArray(updatedTransaction.items)) updatedTransaction.items = [];

    if (updatedTransaction.status !== STATUS.HOLD && updatedTransaction.status !== STATUS.PAID) {
      return res.status(422).send({ message: "Invalid status update. Use void/refund controls for finalized transactions." });
    }

    ensureInvoiceSerial(updatedTransaction, function (serialErr, readyTransaction) {
      if (serialErr) {
        if (serialErr.statusCode) {
          return res.status(serialErr.statusCode).send({ message: serialErr.message });
        }
        return res.status(500).send(serialErr);
      }

      transactionsDB.update({ _id: existingTransaction._id }, readyTransaction, {}, function (updateErr) {
        if (updateErr) return res.status(500).send(updateErr);

        if (
          existingStatus !== STATUS.PAID &&
          normalizeStatus(readyTransaction.status, STATUS.HOLD) === STATUS.PAID &&
          isPaidEnough(readyTransaction)
        ) {
          Inventory.decrementInventory(readyTransaction.items);
        }

        createAuditLog("TRANSACTION_UPDATED", {
          transaction_id: readyTransaction._id,
          order: readyTransaction.order,
          previous_status: existingStatus,
          status: readyTransaction.status,
          total: readyTransaction.total,
          user: readyTransaction.user || "",
          user_id: readyTransaction.user_id || "",
          till: readyTransaction.till || "",
          mac: readyTransaction.mac || ""
        });

        res.send(readyTransaction);
      });
    });
  });
});

app.post("/void", function (req, res) {
  let transactionId = normalizeId(req.body.transactionId);
  let reason = String(req.body.reason || "").trim();

  if (!transactionId) return res.status(400).send({ message: "Transaction ID is required." });
  if (reason === "") return res.status(422).send({ message: "Void reason is required." });

  transactionsDB.findOne({ _id: transactionId }, function (findErr, transaction) {
    if (findErr) return res.status(500).send(findErr);
    if (!transaction) return res.status(404).send({ message: "Transaction not found." });

    let currentStatus = normalizeStatus(transaction.status, STATUS.HOLD);
    if (currentStatus !== STATUS.PAID) {
      return res.status(422).send({ message: "Only paid transactions can be voided." });
    }

    let updatedTransaction = Object.assign({}, transaction, {
      status: STATUS.VOIDED,
      void_reason: reason,
      voided_at: nowISO(),
      voided_by: req.body.user || "",
      voided_by_id: req.body.user_id || "",
      voided_till: req.body.till || "",
      voided_mac: req.body.mac || "",
      updated_at: nowISO()
    });

    transactionsDB.update({ _id: transactionId }, updatedTransaction, {}, function (updateErr) {
      if (updateErr) return res.status(500).send(updateErr);

      Inventory.incrementInventory(transaction.items);

      createAuditLog("TRANSACTION_VOIDED", {
        transaction_id: transactionId,
        order: transaction.order,
        reason: reason,
        by: req.body.user || "",
        by_id: req.body.user_id || "",
        till: req.body.till || "",
        mac: req.body.mac || ""
      });

      res.send(updatedTransaction);
    });
  });
});

app.post("/refund", function (req, res) {
  let transactionId = normalizeId(req.body.transactionId);
  let reason = String(req.body.reason || "").trim();

  if (!transactionId) return res.status(400).send({ message: "Transaction ID is required." });
  if (reason === "") return res.status(422).send({ message: "Refund reason is required." });

  transactionsDB.findOne({ _id: transactionId }, function (findErr, transaction) {
    if (findErr) return res.status(500).send(findErr);
    if (!transaction) return res.status(404).send({ message: "Transaction not found." });

    let currentStatus = normalizeStatus(transaction.status, STATUS.HOLD);
    if (currentStatus !== STATUS.PAID) {
      return res.status(422).send({ message: "Only paid transactions can be refunded." });
    }

    getNextSerial(SERIAL_TYPES.REFUND, function (serialErr, refundSerial) {
      if (serialErr) return res.status(500).send(serialErr);

      let updatedTransaction = Object.assign({}, transaction, {
        status: STATUS.REFUNDED,
        refund_reason: reason,
        refund_reference: refundSerial.serial,
        refunded_at: nowISO(),
        refunded_by: req.body.user || "",
        refunded_by_id: req.body.user_id || "",
        refunded_till: req.body.till || "",
        refunded_mac: req.body.mac || "",
        updated_at: nowISO()
      });

      transactionsDB.update({ _id: transactionId }, updatedTransaction, {}, function (updateErr) {
        if (updateErr) return res.status(500).send(updateErr);

        Inventory.incrementInventory(transaction.items);

        createAuditLog("TRANSACTION_REFUNDED", {
          transaction_id: transactionId,
          order: transaction.order,
          refund_reference: refundSerial.serial,
          reason: reason,
          by: req.body.user || "",
          by_id: req.body.user_id || "",
          till: req.body.till || "",
          mac: req.body.mac || ""
        });

        res.send(updatedTransaction);
      });
    });
  });
});

app.post("/delete", function (req, res) {
  let orderId = normalizeId(req.body.orderId);
  if (!orderId) return res.status(400).send({ message: "Order ID is required." });

  transactionsDB.findOne({ _id: orderId }, function (findErr, transaction) {
    if (findErr) return res.status(500).send(findErr);
    if (!transaction) return res.status(404).send({ message: "Order not found." });

    if (normalizeStatus(transaction.status, STATUS.HOLD) !== STATUS.HOLD) {
      return res.status(403).send({ message: "Only hold/unpaid orders can be deleted." });
    }

    transactionsDB.remove({ _id: orderId }, function (removeErr) {
      if (removeErr) return res.status(500).send(removeErr);

      createAuditLog("HOLD_ORDER_DELETED", {
        transaction_id: orderId,
        order: transaction.order,
        user: req.body.user || "",
        user_id: req.body.user_id || ""
      });

      res.sendStatus(200);
    });
  });
});

app.get("/:transactionId", function (req, res) {
  let transactionId = normalizeId(req.params.transactionId);

  transactionsDB.findOne({ _id: transactionId }, function (err, doc) {
    if (err) return res.status(500).send(err);
    if (!doc) return res.status(404).send({ message: "Transaction not found." });
    res.send(doc);
  });
});
