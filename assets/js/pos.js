let cart = [];
let index = 0;
let allUsers = [];
let allProducts = [];
let allCategories = [];
let allTransactions = [];
let sold = [];
let state = [];
let sold_items = [];
let item;
let auth;
let holdOrder = 0;
let vat = 0;
let perms = null;
let deleteId = 0;
let paymentType = 0;
let receipt = '';
let totalVat = 0;
let subTotal = 0;
let method = '';
let order_index = 0;
let user_index = 0;
let product_index = 0;
let transaction_index;
let host = 'localhost';
let path = require('path');
let port = '8001';
let moment = require('moment');
let Swal = require('sweetalert2');
let { ipcRenderer } = require('electron');
let dotInterval = setInterval(function () { $(".dot").text('.') }, 3000);
let img_path = process.env.APPDATA + '/POS/uploads/';
let api = 'http://' + host + ':' + port + '/api/';
let btoa = require('btoa');
const jspdfLib = require('jspdf');
const jsPDF = jspdfLib.jsPDF || jspdfLib;
let html2canvas = require('html2canvas');
let JsBarcode = require('jsbarcode');
let macaddress = require('macaddress');
let categories = [];
let holdOrderList = [];
let customerOrderList = [];
let ownUserEdit = null;
let totalPrice = 0;
let orderTotal = 0;
let vatBreakdown = { taxable: 0, exempt: 0, zeroRated: 0, vatAmount: 0, grossTotal: 0 };
let auth_error = 'Incorrect username or password';
let auth_empty = 'Please enter a username and password';
let holdOrderlocation = $("#randerHoldOrders");
let customerOrderLocation = $("#randerCustomerOrders");

// Simple fs-based JSON store replacing electron-store (incompatible with Electron 14+)
const _fs = require('fs');
const _storePath = process.env.APPDATA + '/POS/storage.json';
const storage = {
    _data: (() => { try { return JSON.parse(_fs.readFileSync(_storePath, 'utf8')); } catch (e) { return {}; } })(),
    get(key) { return this._data[key]; },
    set(key, val) { this._data[key] = val; _fs.writeFileSync(_storePath, JSON.stringify(this._data)); },
    delete(key) { delete this._data[key]; _fs.writeFileSync(_storePath, JSON.stringify(this._data)); }
};
let settings;
let platform;
let user = {};
let start = moment().startOf('month');
let end = moment();
let start_date = moment(start).toDate();
let end_date = moment(end).toDate();
let by_till = 0;
let by_user = 0;
let by_status = 1;

function isVatChargeEnabled() {
    if (!settings) return false;
    return settings.charge_tax === true || settings.charge_tax === 'on' || settings.charge_tax === 1 || settings.charge_tax === '1';
}

function getVatPricingMode() {
    if (!settings || !settings.vat_pricing_mode) return 'inclusive';
    return settings.vat_pricing_mode === 'exclusive' ? 'exclusive' : 'inclusive';
}

function getProductTaxType(product) {
    if (!product || !product.tax_type) return 'vatable';
    if (product.tax_type === 'exempt' || product.tax_type === 'zero_rated') return product.tax_type;
    return 'vatable';
}

function refreshTaxInfoLabel() {
    const rate = isNaN(vat) ? 0 : vat;
    const modeLabel = getVatPricingMode() === 'inclusive' ? 'inc' : 'exc';
    if (isVatChargeEnabled()) {
        $("#taxInfo").text(rate);
        $("#grossPriceLabel").text(`Gross Price (${modeLabel} ${rate}% VAT)`);
    } else {
        $("#taxInfo").text(0);
        $("#grossPriceLabel").text('Gross Price');
    }
}

function formatTaxTypeLabel(taxType) {
    if (taxType === 'exempt') return 'VAT-Exempt';
    if (taxType === 'zero_rated') return 'Zero-Rated';
    return 'VATable';
}

function buildTaxRowsForReceipt(breakdown, taxValue, pricingMode) {
    const mode = pricingMode || getVatPricingMode();
    const vatLabel = mode === 'exclusive' ? 'VAT (' + settings.percentage + '%, on top)' : 'VAT (' + settings.percentage + '%, inclusive)';
    let rows = `
            <tr>
                <td colspan="3">VATable Sales</td>
                <td style="text-align:right;">${settings.symbol}${parseFloat(breakdown.taxable || 0).toFixed(2)}</td>
            </tr>
            <tr>
                <td colspan="3">VAT-Exempt Sales</td>
                <td style="text-align:right;">${settings.symbol}${parseFloat(breakdown.exempt || 0).toFixed(2)}</td>
            </tr>
            <tr>
                <td colspan="3">Zero-Rated Sales</td>
                <td style="text-align:right;">${settings.symbol}${parseFloat(breakdown.zeroRated || 0).toFixed(2)}</td>
            </tr>`;

    if (parseFloat(taxValue || 0) > 0 || isVatChargeEnabled()) {
        rows += `
            <tr>
                <td colspan="3">${vatLabel}</td>
                <td style="text-align:right;">${settings.symbol}${parseFloat(taxValue || 0).toFixed(2)}</td>
            </tr>`;
    }

    return rows;
}

function buildVatClassificationRows(breakdown) {
    let rows = '';
    if (parseFloat(breakdown.exempt || 0) > 0) {
        rows += `<tr><td colspan="4"><b>VAT-Exempt Sale</b></td></tr>`;
    }
    if (parseFloat(breakdown.zeroRated || 0) > 0) {
        rows += `<tr><td colspan="4"><b>Zero-Rated Sale</b></td></tr>`;
    }
    return rows;
}

$(function () {

    function cb(start, end) {
        $('#reportrange span').html(start.format('MMMM D, YYYY') + '  -  ' + end.format('MMMM D, YYYY'));
    }

    $('#reportrange').daterangepicker({
        startDate: start,
        endDate: end,
        autoApply: true,
        timePicker: true,
        timePicker24Hour: true,
        timePickerIncrement: 10,
        timePickerSeconds: true,
        // minDate: '',
        ranges: {
            'Today': [moment().startOf('day'), moment()],
            'Yesterday': [moment().subtract(1, 'days').startOf('day'), moment().subtract(1, 'days').endOf('day')],
            'Last 7 Days': [moment().subtract(6, 'days').startOf('day'), moment().endOf('day')],
            'Last 30 Days': [moment().subtract(29, 'days').startOf('day'), moment().endOf('day')],
            'This Month': [moment().startOf('month'), moment().endOf('month')],
            'This Month': [moment().startOf('month'), moment()],
            'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
        }
    }, cb);

    cb(start, end);

});


$.fn.serializeObject = function () {
    var o = {};
    var a = this.serializeArray();
    $.each(a, function () {
        if (o[this.name]) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
};


auth = storage.get('auth');
user = storage.get('user');


if (auth == undefined) {
    $.get(api + 'users/check/', function (data) { });
    $("#loading").show();
    authenticate();

} else {

    $('#loading').show();

    setTimeout(function () {
        $('#loading').hide();
    }, 2000);

    platform = storage.get('settings');

    if (platform != undefined) {

        if (platform.app == 'Network Point of Sale Terminal') {
            api = 'http://' + platform.ip + ':' + port + '/api/';
            perms = true;
        }
    }

    $.get(api + 'users/user/' + user._id, function (data) {
        user = data;
        $('#loggedin-user').text(user.fullname);
    });


    $.get(api + 'settings/get', function (data) {
        settings = data.settings;
        if (settings) {
            settings.vat_pricing_mode = settings.vat_pricing_mode || 'inclusive';
            vat = parseFloat(settings.percentage) || 0;
            refreshTaxInfoLabel();
        }
    });


    $.get(api + 'users/all', function (users) {
        allUsers = [...users];
    });



    $(document).ready(function () {

        $(".loading").hide();

        loadCategories();
        loadProducts();
        loadCustomers();


        if (settings && settings.symbol) {
            $("#price_curr, #payment_curr, #change_curr").text(settings.symbol);
        }


        setTimeout(function () {
            if (settings == undefined && auth != undefined) {
                $('#settingsModal').modal('show');
            }
            else {
                vat = parseFloat(settings.percentage) || 0;
                settings.vat_pricing_mode = settings.vat_pricing_mode || 'inclusive';
                refreshTaxInfoLabel();
            }

        }, 1500);



        $("#settingsModal").on("hide.bs.modal", function () {

            setTimeout(function () {
                if (settings == undefined && auth != undefined) {
                    $('#settingsModal').modal('show');
                }
            }, 1000);

        });


        if (0 == user.perm_products) { $(".p_one").hide() };
        if (0 == user.perm_categories) { $(".p_two").hide() };
        if (0 == user.perm_transactions) { $(".p_three").hide() };
        if (0 == user.perm_users) { $(".p_four").hide() };
        if (0 == user.perm_settings) { $(".p_five").hide() };

        function loadProducts() {

            $.get(api + 'inventory/products', function (data) {

                data.forEach(item => {
                    item.price = parseFloat(item.price).toFixed(2);
                    item.tax_type = getProductTaxType(item);
                });

                allProducts = [...data];

                loadProductList();

                $('#parent').text('');
                $('#categories').html(`<button type="button" id="all" class="btn btn-categories btn-white waves-effect waves-light">All</button> `);

                data.forEach(item => {

                    if (!categories.includes(item.category)) {
                        categories.push(item.category);
                    }

                    let item_info = `<div class="col-lg-2 pt-1 box ${item.category}"
                                onclick="$(this).addToCart(${item._id}, ${item.quantity}, ${item.stock})">
                            <div class="widget-panel widget-style-2 ">                    
                            <div id="image"><img src="${item.img == "" ? "./assets/images/default.jpg" : img_path + item.img}" id="product_img" alt=""></div>                    
                                        <div class="text-muted m-t-5 text-center">
                                        <div class="name" id="product_name">${item.name}</div> 
                                        <span class="sku">${item.sku || item._id}</span>
                                        <span class="stock">STOCK </span><span class="count">${item.stock == 1 ? item.quantity : 'N/A'}</span></div>
                                        <sp class="text-success text-center"><b data-plugin="counterup">${settings.symbol + item.price}</b> </sp>
                            </div>
                        </div>`;
                    $('#parent').append(item_info);
                });

                categories.forEach(category => {

                    let c = allCategories.filter(function (ctg) {
                        return ctg._id == category;
                    })

                    $('#categories').append(`<button type="button" id="${category}" class="btn btn-categories btn-white waves-effect waves-light">${c.length > 0 ? c[0].name : ''}</button> `);
                });

            });

        }

        function loadCategories() {
            $.get(api + 'categories/all', function (data) {
                allCategories = data;
                loadCategoryList();
                $('#category').html(`<option value="0">Select</option>`);
                allCategories.forEach(category => {
                    $('#category').append(`<option value="${category._id}">${category.name}</option>`);
                });
            });
        }


        function loadCustomers() {

            $.get(api + 'customers/all', function (customers) {

                $('#customer').html(`<option value="0" selected="selected">Walk in customer</option>`);

                customers.forEach(cust => {

                    let customer = `<option value='{"id": ${cust._id}, "name": "${cust.name}"}'>${cust.name}</option>`;
                    $('#customer').append(customer);
                });

                //  $('#customer').chosen();

            });

        }


        $.fn.addToCart = function (id, count, stock) {

            if (stock == 1) {
                if (count > 0) {
                    $.get(api + 'inventory/product/' + id, function (data) {
                        $(this).addProductToCart(data);
                    });
                }
                else {
                    Swal.fire(
                        'Out of stock!',
                        'This item is currently unavailable',
                        'info'
                    );
                }
            }
            else {
                $.get(api + 'inventory/product/' + id, function (data) {
                    $(this).addProductToCart(data);
                });
            }

        };


        function barcodeSearch(e) {

            e.preventDefault();
            $("#basic-addon2").empty();
            $("#basic-addon2").append(
                $('<i>', { class: 'fa fa-spinner fa-spin' })
            );

            let req = {
                skuCode: $("#skuCode").val()
            }

            $.ajax({
                url: api + 'inventory/product/sku',
                type: 'POST',
                data: JSON.stringify(req),
                contentType: 'application/json; charset=utf-8',
                cache: false,
                processData: false,
                success: function (data) {

                    if (data._id != undefined && data.quantity >= 1) {
                        $(this).addProductToCart(data);
                        $("#searchBarCode").get(0).reset();
                        $("#basic-addon2").empty();
                        $("#basic-addon2").append(
                            $('<i>', { class: 'glyphicon glyphicon-ok' })
                        )
                    }
                    else if (data.quantity < 1) {
                        Swal.fire(
                            'Out of stock!',
                            'This item is currently unavailable',
                            'info'
                        );
                    }
                    else {

                        Swal.fire(
                            'Not Found!',
                            '<b>' + $("#skuCode").val() + '</b> is not a valid barcode!',
                            'warning'
                        );

                        $("#searchBarCode").get(0).reset();
                        $("#basic-addon2").empty();
                        $("#basic-addon2").append(
                            $('<i>', { class: 'glyphicon glyphicon-ok' })
                        )
                    }

                }, error: function (data) {
                    if (data.status === 422) {
                        $(this).showValidationError(data);
                        $("#basic-addon2").append(
                            $('<i>', { class: 'glyphicon glyphicon-remove' })
                        )
                    }
                    else if (data.status === 404) {
                        $("#basic-addon2").empty();
                        $("#basic-addon2").append(
                            $('<i>', { class: 'glyphicon glyphicon-remove' })
                        )
                    }
                    else {
                        $(this).showServerError();
                        $("#basic-addon2").empty();
                        $("#basic-addon2").append(
                            $('<i>', { class: 'glyphicon glyphicon-warning-sign' })
                        )
                    }
                }
            });

        }


        $("#searchBarCode").on('submit', function (e) {
            barcodeSearch(e);
        });



        $('body').on('click', '#jq-keyboard button', function (e) {
            let pressed = $(this)[0].className.split(" ");
            if ($("#skuCode").val() != "" && pressed[2] == "enter") {
                barcodeSearch(e);
            }
        });



        $.fn.addProductToCart = function (data) {
            item = {
                id: data._id,
                product_name: data.name,
                sku: data.sku || data._id,
                price: data.price,
                tax_type: getProductTaxType(data),
                quantity: 1
            };

            if ($(this).isExist(item)) {
                $(this).qtIncrement(index);
            } else {
                cart.push(item);
                $(this).renderTable(cart)
            }
        }


        $.fn.isExist = function (data) {
            let toReturn = false;
            $.each(cart, function (index, value) {
                if (value.id == data.id) {
                    $(this).setIndex(index);
                    toReturn = true;
                }
            });
            return toReturn;
        }


        $.fn.setIndex = function (value) {
            index = value;
        }


        $.fn.calculateCart = function () {
            let baseTotal = 0;
            let grossTotal = 0;
            let taxableSales = 0;
            let exemptSales = 0;
            let zeroRatedSales = 0;
            let discount = parseFloat($("#inputDiscount").val() || 0);
            let discountAllocated = 0;
            let vatEnabled = isVatChargeEnabled();
            let vatMode = getVatPricingMode();
            totalVat = 0;

            $('#total').text(cart.length);

            $.each(cart, function (index, data) {
                baseTotal += data.quantity * parseFloat(data.price);
            });

            if (isNaN(discount) || discount < 0) {
                discount = 0;
                $("#inputDiscount").val(0);
            }

            if (discount >= baseTotal && baseTotal > 0) {
                discount = 0;
                $("#inputDiscount").val(0);
            }

            $.each(cart, function (index, data) {
                let lineAmount = data.quantity * parseFloat(data.price);
                let lineDiscount = 0;

                if (discount > 0 && baseTotal > 0) {
                    if (index === cart.length - 1) {
                        lineDiscount = discount - discountAllocated;
                    } else {
                        lineDiscount = discount * (lineAmount / baseTotal);
                        discountAllocated += lineDiscount;
                    }
                }

                let netLine = lineAmount - lineDiscount;
                if (netLine < 0) netLine = 0;

                let taxType = getProductTaxType(data);

                if (taxType === 'vatable') {
                    if (vatEnabled) {
                        if (vatMode === 'exclusive') {
                            let lineVat = (netLine * vat) / 100;
                            taxableSales += netLine;
                            totalVat += lineVat;
                            grossTotal += (netLine + lineVat);
                        } else {
                            let lineVat = (netLine * vat) / (100 + vat);
                            taxableSales += (netLine - lineVat);
                            totalVat += lineVat;
                            grossTotal += netLine;
                        }
                    } else {
                        taxableSales += netLine;
                        grossTotal += netLine;
                    }
                } else if (taxType === 'exempt') {
                    exemptSales += netLine;
                    grossTotal += netLine;
                } else {
                    zeroRatedSales += netLine;
                    grossTotal += netLine;
                }
            });

            subTotal = baseTotal - discount;
            if (subTotal < 0) subTotal = 0;
            if (!vatEnabled) {
                totalVat = 0;
            }

            vatBreakdown = {
                taxable: parseFloat(taxableSales.toFixed(2)),
                exempt: parseFloat(exemptSales.toFixed(2)),
                zeroRated: parseFloat(zeroRatedSales.toFixed(2)),
                vatAmount: parseFloat(totalVat.toFixed(2)),
                grossTotal: parseFloat(grossTotal.toFixed(2))
            };

            $('#price').text(settings.symbol + subTotal.toFixed(2));

            orderTotal = grossTotal.toFixed(2);

            $("#gross_price").text(settings.symbol + grossTotal.toFixed(2));
            $("#payablePrice").val(grossTotal.toFixed(2));
        };



        $.fn.renderTable = function (cartList) {
            $('#cartTable > tbody').empty();
            $(this).calculateCart();
            $.each(cartList, function (index, data) {
                $('#cartTable > tbody').append(
                    $('<tr>').append(
                        $('<td>', { class: 'number', text: index + 1 }),
                        $('<td>', { class: 'item', text: data.product_name }),
                        $('<td>', { class: 'qty' }).append(
                            $('<div>', { class: 'input-group' }).append(
                                $('<div>', { class: 'input-group-btn btn-xs' }).append(
                                    $('<button>', {
                                        class: 'btn btn-default btn-xs',
                                        onclick: '$(this).qtDecrement(' + index + ')'
                                    }).append(
                                        $('<i>', { class: 'fa fa-minus' })
                                    )
                                ),
                                $('<input>', {
                                    class: 'form-control',
                                    type: 'number',
                                    value: data.quantity,
                                    onInput: '$(this).qtInput(' + index + ')'
                                }),
                                $('<div>', {
                                    class: 'input-group-btn btn-xs d-flex justify-content-center align-items-center'
                                }).append(
                                    $('<button>', {
                                        class: 'btn btn-default btn-xs',
                                        onclick: '$(this).qtIncrement(' + index + ')'
                                    }).append(
                                        $('<i>', { class: 'fa fa-plus' })
                                    )
                                )
                            )
                        ),
                        $('<td>', { class: 'price', text: settings.symbol + (data.price * data.quantity).toFixed(2) }),
                        $('<td>', { class: 'action' }).append(
                            $('<button>', {
                                class: 'btn btn-danger btn-xs',
                                onclick: '$(this).deleteFromCart(' + index + ')'
                            }).append(
                                $('<i>', { class: 'fa fa-times' })
                            )
                        )
                    )
                )
            })
        };


        $.fn.deleteFromCart = function (index) {
            cart.splice(index, 1);
            $(this).renderTable(cart);

        }


        $.fn.qtIncrement = function (i) {

            item = cart[i];

            let product = allProducts.filter(function (selected) {
                return selected._id == parseInt(item.id);
            });

            if (product[0].stock == 1) {
                if (item.quantity < product[0].quantity) {
                    item.quantity += 1;
                    $(this).renderTable(cart);
                }

                else {
                    Swal.fire(
                        'No more stock!',
                        'You have already added all the available stock.',
                        'info'
                    );
                }
            }
            else {
                item.quantity += 1;
                $(this).renderTable(cart);
            }

        }


        $.fn.qtDecrement = function (i) {
            if (item.quantity > 1) {
                item = cart[i];
                item.quantity -= 1;
                $(this).renderTable(cart);
            }
        }


        $.fn.qtInput = function (i) {
            item = cart[i];
            item.quantity = $(this).val();
            $(this).renderTable(cart);
        }


        $.fn.cancelOrder = function () {

            if (cart.length > 0) {
                Swal.fire({
                    title: 'Are you sure?',
                    text: "You are about to remove all items from the cart.",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#d33',
                    confirmButtonText: 'Yes, clear it!'
                }).then((result) => {

                    if (result.value) {

                        cart = [];
                        $(this).renderTable(cart);
                        holdOrder = 0;

                        Swal.fire(
                            'Cleared!',
                            'All items have been removed.',
                            'success'
                        )
                    }
                });
            }

        }


        $("#payButton").on('click', function () {
            if (cart.length != 0) {
                paymentType = 0; // Cash only
                $("#paymentModel").modal('toggle');
            } else {
                Swal.fire(
                    'Oops!',
                    'There is nothing to pay!',
                    'warning'
                );
            }

        });


        $("#hold").on('click', function () {

            if (cart.length != 0) {

                $("#dueModal").modal('toggle');
            } else {
                Swal.fire(
                    'Oops!',
                    'There is nothing to hold!',
                    'warning'
                );
            }
        });


        function printJobComplete() {
            alert("print job complete");
        }


        $.fn.submitDueOrder = function (status) {

            let items = "";
            let payment = 0;
            let customer = JSON.parse($("#customer").val());
            let customerName = customer == 0 ? 'Walk in customer' : customer.name;
            let customerTin = customer && customer.tin ? customer.tin : '';
            let customerAddress = customer && customer.address ? customer.address : '';

            cart.forEach(item => {
                let unitPrice = parseFloat(item.price);
                let lineAmount = unitPrice * parseFloat(item.quantity);
                items += "<tr><td>" + item.product_name + " <small>(" + formatTaxTypeLabel(getProductTaxType(item)) + ")</small></td><td style=\"text-align:center;\">" + item.quantity + "</td><td style=\"text-align:right;\">" + settings.symbol + unitPrice.toFixed(2) + "</td><td style=\"text-align:right;\">" + settings.symbol + lineAmount.toFixed(2) + "</td></tr>";

            });

            let currentTime = new Date(moment());

            let discount = $("#inputDiscount").val();
            let date = moment(currentTime).format("YYYY-MM-DD HH:mm:ss");
            let paid = $("#payment").val() == "" ? "" : parseFloat($("#payment").val()).toFixed(2);
            let change = $("#change").text() == "" ? "" : parseFloat($("#change").text()).toFixed(2);
            let refNumber = $("#refNumber").val();
            let orderNumber = holdOrder;
            let type = "Cash";
            let tax_rows = buildTaxRowsForReceipt(vatBreakdown, totalVat, getVatPricingMode());
            let classification_rows = buildVatClassificationRows(vatBreakdown);


            if (paid != "") {
                payment = `<tr>
                        <td colspan="3">Amount Tendered</td>
                        <td style="text-align:right;">${settings.symbol + paid}</td>
                    </tr>
                    <tr>
                        <td colspan="3">Change</td>
                        <td style="text-align:right;">${settings.symbol + Math.abs(change).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td colspan="3">Payment Method</td>
                        <td style="text-align:right;">${type}</td>
                    </tr>`
            }

            if (status == 0) {

                if ($("#customer").val() == 0 && $("#refNumber").val() == "") {
                    Swal.fire(
                        'Reference Required!',
                        'You either need to select a customer <br> or enter a reference!',
                        'warning'
                    )

                    return;
                }
            }


            $(".loading").show();


            if (holdOrder != 0) {

                orderNumber = holdOrder;
                method = 'PUT'
            }
            else {
                orderNumber = Math.floor(Date.now() / 1000);
                method = 'POST'
            }


            receipt = `<div style="font-size: 10px;">                            
        <p style="text-align: center;">
        ${settings.img == "" ? settings.img : '<img style="max-width: 50px;max-width: 100px;" src ="' + img_path + settings.img + '" /><br>'}
            <span style="font-size: 22px;">${settings.store}</span> <br>
            <span style="font-size:16px; font-weight:bold;">INVOICE</span><br>
            ${settings.address_one} <br>
            ${settings.address_two} <br>
            ${settings.contact != '' ? 'Tel: ' + settings.contact + '<br>' : ''} 
            ${settings.tax != '' ? 'VAT REG TIN: ' + settings.tax + '<br>' : 'VAT REG TIN: ____________________<br>'}
        </p>
        <hr>
        <left>
            <p>
            Invoice No : ${orderNumber} <br>
            Date : ${date}<br>
            Ref No : ${refNumber == "" ? orderNumber : refNumber} <br>
            Sold To : ${customerName} <br>
            Buyer TIN : ${customerTin}<br>
            Buyer Address : ${customerAddress}<br>
            Cashier : ${user.fullname} <br>
            </p>

        </left>
        <hr>
        <table width="100%">
            <thead style="text-align: left;">
            <tr>
                <th>Item</th>
                <th>Qty</th>
                <th style="text-align:right;">Unit Price</th>
                <th style="text-align:right;">Amount</th>
            </tr>
            </thead>
            <tbody>
            ${items}                
     
            <tr>                        
                <td colspan="3"><b>${getVatPricingMode() === 'inclusive' ? 'Total Sales (VAT Inclusive)' : 'Total Sales (VAT Exclusive)'}</b></td>
                <td style="text-align:right;"><b>${settings.symbol}${subTotal.toFixed(2)}</b></td>
            </tr>
            <tr>
                <td colspan="3">Less: Discount</td>
                <td style="text-align:right;">${discount > 0 ? settings.symbol + parseFloat(discount).toFixed(2) : settings.symbol + '0.00'}</td>
            </tr>
            
            ${tax_rows}
            ${classification_rows}
        
            <tr>
                <td colspan="3"><h5>Total Amount Due (VAT Inclusive)</h5></td>
                <td style="text-align:right;"><h5>${settings.symbol}${parseFloat(orderTotal).toFixed(2)}</h5></td>
            </tr>
            ${payment == 0 ? '' : payment}
            </tbody>
            </table>
            <br>
            <hr>
            <br>
            <p style="text-align: center;">
             ${settings.footer}
             </p>
            </div>`;


            if (status == 3) {
                if (cart.length > 0) {

                    printJS({ printable: receipt, type: 'raw-html' });

                    $(".loading").hide();
                    return;

                }
                else {

                    $(".loading").hide();
                    return;
                }
            }


            let data = {
                order: orderNumber,
                ref_number: refNumber,
                discount: discount,
                customer: customer,
                status: status,
                subtotal: parseFloat(subTotal).toFixed(2),
                tax: totalVat,
                taxable_sales: vatBreakdown.taxable,
                exempt_sales: vatBreakdown.exempt,
                zero_rated_sales: vatBreakdown.zeroRated,
                vat_pricing_mode: getVatPricingMode(),
                order_type: 1,
                items: cart,
                date: currentTime,
                payment_type: 0,
                payment_info: "",
                total: orderTotal,
                paid: paid,
                change: change,
                _id: orderNumber,
                till: platform.till,
                mac: platform.mac,
                user: user.fullname,
                user_id: user._id
            }


            $.ajax({
                url: api + 'new',
                type: method,
                data: JSON.stringify(data),
                contentType: 'application/json; charset=utf-8',
                cache: false,
                processData: false,
                success: function (data) {

                    cart = [];
                    $('#viewTransaction').html('');
                    $('#viewTransaction').html(receipt);
                    $('#orderModal').modal('show');
                    loadProducts();
                    loadCustomers();
                    $(".loading").hide();
                    $("#dueModal").modal('hide');
                    $("#paymentModel").modal('hide');
                    $(this).getHoldOrders();
                    $(this).getCustomerOrders();
                    $(this).renderTable(cart);

                }, error: function (data) {
                    $(".loading").hide();
                    $("#dueModal").modal('toggle');
                    swal("Something went wrong!", 'Please refresh this page and try again');

                }
            });

            $("#refNumber").val('');
            $("#change").text('');
            $("#payment").val('');

        }


        $.get(api + 'on-hold', function (data) {
            holdOrderList = data;
            holdOrderlocation.empty();
            clearInterval(dotInterval);
            $(this).randerHoldOrders(holdOrderList, holdOrderlocation, 1);
        });


        $.fn.getHoldOrders = function () {
            $.get(api + 'on-hold', function (data) {
                holdOrderList = data;
                clearInterval(dotInterval);
                holdOrderlocation.empty();
                $(this).randerHoldOrders(holdOrderList, holdOrderlocation, 1);
            });
        };


        $.fn.randerHoldOrders = function (data, renderLocation, orderType) {
            $.each(data, function (index, order) {
                $(this).calculatePrice(order);

                renderLocation.append(
                    $('<div>', {
                        class: orderType == 1 ? 'col-md-3 order' : 'col-md-3 customer-order'
                    }).append(
                        $('<div>', { class: 'hold-order-card card-box order-box' }).append(

                            // Header
                            $('<div>', { class: 'hold-order-header' }).append(
                                $('<div>', { class: 'hold-order-ref' }).append(
                                    $('<span>', { class: 'label-title', text: 'Ref' }),
                                    $('<span>', { class: 'ref_number ref-value', text: order.ref_number })
                                ),
                                $('<span>', {
                                    class: 'label label-info hold-order-price',
                                    text: settings.symbol + order.total
                                })
                            ),

                            // Body
                            $('<div>', { class: 'hold-order-body' }).append(
                                $('<div>', { class: 'hold-order-row' }).append(
                                    $('<span>', { class: 'row-label', text: 'Items' }),
                                    $('<span>', { class: 'row-value', text: order.items.length })
                                ),
                                $('<div>', { class: 'hold-order-row' }).append(
                                    $('<span>', { class: 'row-label', text: 'Customer' }),
                                    $('<span>', {
                                        class: 'row-value customer_name',
                                        text: order.customer != 0 ? order.customer.name : 'Walk in customer'
                                    })
                                )
                            ),

                            // Actions
                            $('<div>', { class: 'hold-order-actions' }).append(
                                $('<button>', {
                                    class: 'btn btn-default btn-sm',
                                    onclick: '$(this).orderDetails(' + index + ',' + orderType + ')',
                                    title: 'View order details'
                                }).append(
                                    $('<i>', { class: 'fa fa-shopping-basket' }),
                                    $('<span>', { text: ' Details', style: 'margin-left:6px;' })
                                ),

                                $('<button>', {
                                    class: 'btn btn-danger btn-sm del',
                                    onclick: '$(this).deleteOrder(' + index + ',' + orderType + ')',
                                    title: 'Delete order'
                                }).append(
                                    $('<i>', { class: 'fa fa-trash' }),
                                    $('<span>', { text: ' Delete', style: 'margin-left:6px;' })
                                )
                            )
                        )
                    )
                );
            });
        };


        $.fn.calculatePrice = function (data) {
            totalPrice = 0;
            $.each(data.products, function (index, product) {
                totalPrice += product.price * product.quantity;
            })

            let vat = (totalPrice * data.vat) / 100;
            totalPrice = ((totalPrice + vat) - data.discount).toFixed(0);

            return totalPrice;
        };


        $.fn.orderDetails = function (index, orderType) {

            $('#refNumber').val('');

            if (orderType == 1) {

                $('#refNumber').val(holdOrderList[index].ref_number);

                $("#customer option:selected").removeAttr('selected');

                $("#customer option").filter(function () {
                    return $(this).text() == "Walk in customer";
                }).prop("selected", true);

                holdOrder = holdOrderList[index]._id;
                cart = [];
                $.each(holdOrderList[index].items, function (index, product) {
                    item = {
                        id: product.id,
                        product_name: product.product_name,
                        sku: product.sku,
                        price: product.price,
                        tax_type: getProductTaxType(product),
                        quantity: product.quantity
                    };
                    cart.push(item);
                })
            } else if (orderType == 2) {

                $('#refNumber').val('');

                $("#customer option:selected").removeAttr('selected');

                $("#customer option").filter(function () {
                    return $(this).text() == customerOrderList[index].customer.name;
                }).prop("selected", true);


                holdOrder = customerOrderList[index]._id;
                cart = [];
                $.each(customerOrderList[index].items, function (index, product) {
                    item = {
                        id: product.id,
                        product_name: product.product_name,
                        sku: product.sku,
                        price: product.price,
                        tax_type: getProductTaxType(product),
                        quantity: product.quantity
                    };
                    cart.push(item);
                })
            }
            $(this).renderTable(cart);
            $("#holdOrdersModal").modal('hide');
            $("#customerModal").modal('hide');
        }


        $.fn.deleteOrder = function (index, type) {

            switch (type) {
                case 1: deleteId = holdOrderList[index]._id;
                    break;
                case 2: deleteId = customerOrderList[index]._id;
            }

            let data = {
                orderId: deleteId,
            }

            Swal.fire({
                title: "Delete order?",
                text: "This will delete the order. Are you sure you want to delete!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, delete it!'
            }).then((result) => {

                if (result.value) {

                    $.ajax({
                        url: api + 'delete',
                        type: 'POST',
                        data: JSON.stringify(data),
                        contentType: 'application/json; charset=utf-8',
                        cache: false,
                        success: function (data) {

                            $(this).getHoldOrders();
                            $(this).getCustomerOrders();

                            Swal.fire(
                                'Deleted!',
                                'You have deleted the order!',
                                'success'
                            )

                        }, error: function (data) {
                            $(".loading").hide();

                        }
                    });
                }
            });
        }



        $.fn.getCustomerOrders = function () {
            $.get(api + 'customer-orders', function (data) {
                clearInterval(dotInterval);
                customerOrderList = data;
                customerOrderLocation.empty();
                $(this).randerHoldOrders(customerOrderList, customerOrderLocation, 2);
            });
        }



        $('#saveCustomer').on('submit', function (e) {

            e.preventDefault();

            let custData = {
                _id: Math.floor(Date.now() / 1000),
                name: $('#userName').val(),
                phone: $('#phoneNumber').val(),
                email: $('#emailAddress').val(),
                address: $('#userAddress').val()
            }

            $.ajax({
                url: api + 'customers/customer',
                type: 'POST',
                data: JSON.stringify(custData),
                contentType: 'application/json; charset=utf-8',
                cache: false,
                processData: false,
                success: function (data) {
                    $("#newCustomer").modal('hide');
                    Swal.fire("Customer added!", "Customer added successfully!", "success");
                    $("#customer option:selected").removeAttr('selected');
                    $('#customer').append(
                        $('<option>', { text: custData.name, value: `{"id": ${custData._id}, "name": ${custData.name}}`, selected: 'selected' })
                    );

                    $('#customer').val(`{"id": ${custData._id}, "name": ${custData.name}}`).trigger('chosen:updated');

                }, error: function (data) {
                    $("#newCustomer").modal('hide');
                    Swal.fire('Error', 'Something went wrong please try again', 'error')
                }
            })
        })


        $("#confirmPayment").hide();

        $("#payment").on('input', function () {
            $(this).calculateChange();
        });


        $("#confirmPayment").on('click', function () {
            if ($('#payment').val() == "") {
                Swal.fire(
                    'Nope!',
                    'Please enter the amount that was paid!',
                    'warning'
                );
            }
            else {
                $(this).submitDueOrder(1);
            }
        });


        $('#transactions').click(function () {
            loadTransactions();
            loadUserList();

            $('#pos_view').hide();
            $('#pointofsale').show();
            $('#transactions_view').show();
            $(this).hide();

        });


        $('#pointofsale').click(function () {
            $('#pos_view').show();
            $('#transactions').show();
            $('#transactions_view').hide();
            $(this).hide();
        });


        $("#viewRefOrders").click(function () {
            setTimeout(function () {
                $("#holdOrderInput").focus();
            }, 500);
        });


        $("#viewCustomerOrders").click(function () {
            setTimeout(function () {
                $("#holdCustomerOrderInput").focus();
            }, 500);
        });


        $('#newProductModal').click(function () {
            $('#saveProduct').get(0).reset();
            $('#current_img').text('');
            $('#product_id').val('');
            $('#product_tax_type').val('vatable');
        });


        $('#saveProduct').submit(function (e) {
            e.preventDefault();
            $('#product_sku').val(($('#product_sku').val() || '').trim());

            $(this).attr('action', api + 'inventory/product');
            $(this).attr('method', 'POST');

            $(this).ajaxSubmit({
                contentType: 'application/json',
                success: function (response) {

                    $('#saveProduct').get(0).reset();
                    $('#current_img').text('');

                    loadProducts();
                    Swal.fire({
                        title: 'Product Saved',
                        text: "Select an option below to continue.",
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Add another',
                        cancelButtonText: 'Close'
                    }).then((result) => {

                        if (!result.value) {
                            $("#newProduct").modal('hide');
                        }
                    });
                }, error: function (data) {
                    if (data.status === 409) {
                        Swal.fire(
                            'Duplicate barcode',
                            'This barcode/code is already used by another product.',
                            'warning'
                        );
                    } else {
                        console.log(data);
                        Swal.fire(
                            'Save failed',
                            'Could not save product. Please try again.',
                            'error'
                        );
                    }
                }
            });

        });



        $('#saveCategory').submit(function (e) {
            e.preventDefault();

            if ($('#category_id').val() == "") {
                method = 'POST';
            }
            else {
                method = 'PUT';
            }

            $.ajax({
                type: method,
                url: api + 'categories/category',
                data: $(this).serialize(),
                success: function (data, textStatus, jqXHR) {
                    $('#saveCategory').get(0).reset();
                    loadCategories();
                    loadProducts();
                    Swal.fire({
                        title: 'Category Saved',
                        text: "Select an option below to continue.",
                        icon: 'success',
                        showCancelButton: true,
                        confirmButtonColor: '#3085d6',
                        cancelButtonColor: '#d33',
                        confirmButtonText: 'Add another',
                        cancelButtonText: 'Close'
                    }).then((result) => {

                        if (!result.value) {
                            $("#newCategory").modal('hide');
                        }
                    });
                }, error: function (data) {
                    console.log(data);
                }

            });


        });


        $.fn.editProduct = function (index) {

            $('#Products').modal('hide');

            $("#category option").filter(function () {
                return $(this).val() == allProducts[index].category;
            }).prop("selected", true);

            $('#productName').val(allProducts[index].name);
            $('#product_sku').val(allProducts[index].sku || allProducts[index]._id);
            $('#product_price').val(allProducts[index].price);
            $('#quantity').val(allProducts[index].quantity);
            $('#product_tax_type').val(getProductTaxType(allProducts[index]));

            $('#product_id').val(allProducts[index]._id);
            $('#img').val(allProducts[index].img);

            if (allProducts[index].img != "") {

                $('#imagename').hide();
                $('#current_img').html(`<img src="${img_path + allProducts[index].img}" alt="">`);
                $('#rmv_img').show();
            }

            if (allProducts[index].stock == 0) {
                $('#stock').prop("checked", true);
            }

            $('#newProduct').modal('show');
        }


        $("#userModal").on("hide.bs.modal", function () {
            $('.perms').hide();
        });


        $.fn.editUser = function (index) {

            user_index = index;

            $('#Users').modal('hide');

            $('.perms').show();

            $("#user_id").val(allUsers[index]._id);
            $('#fullname').val(allUsers[index].fullname);
            $('#username').val(allUsers[index].username);
            $('#password').val(atob(allUsers[index].password));

            if (allUsers[index].perm_products == 1) {
                $('#perm_products').prop("checked", true);
            }
            else {
                $('#perm_products').prop("checked", false);
            }

            if (allUsers[index].perm_categories == 1) {
                $('#perm_categories').prop("checked", true);
            }
            else {
                $('#perm_categories').prop("checked", false);
            }

            if (allUsers[index].perm_transactions == 1) {
                $('#perm_transactions').prop("checked", true);
            }
            else {
                $('#perm_transactions').prop("checked", false);
            }

            if (allUsers[index].perm_users == 1) {
                $('#perm_users').prop("checked", true);
            }
            else {
                $('#perm_users').prop("checked", false);
            }

            if (allUsers[index].perm_settings == 1) {
                $('#perm_settings').prop("checked", true);
            }
            else {
                $('#perm_settings').prop("checked", false);
            }

            $('#userModal').modal('show');
        }


        $.fn.editCategory = function (index) {
            $('#Categories').modal('hide');
            $('#categoryName').val(allCategories[index].name);
            $('#category_id').val(allCategories[index]._id);
            $('#newCategory').modal('show');
        }


        $.fn.deleteProduct = function (id) {
            Swal.fire({
                title: 'Are you sure?',
                text: "You are about to delete this product.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, delete it!'
            }).then((result) => {

                if (result.value) {

                    $.ajax({
                        url: api + 'inventory/product/' + id,
                        type: 'DELETE',
                        success: function (result) {
                            loadProducts();
                            Swal.fire(
                                'Done!',
                                'Product deleted',
                                'success'
                            );

                        }
                    });
                }
            });
        }


        $.fn.deleteUser = function (id) {
            Swal.fire({
                title: 'Are you sure?',
                text: "You are about to delete this user.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, delete!'
            }).then((result) => {

                if (result.value) {

                    $.ajax({
                        url: api + 'users/user/' + id,
                        type: 'DELETE',
                        success: function (result) {
                            loadUserList();
                            Swal.fire(
                                'Done!',
                                'User deleted',
                                'success'
                            );

                        }
                    });
                }
            });
        }


        $.fn.deleteCategory = function (id) {
            Swal.fire({
                title: 'Are you sure?',
                text: "You are about to delete this category.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Yes, delete it!'
            }).then((result) => {

                if (result.value) {

                    $.ajax({
                        url: api + 'categories/category/' + id,
                        type: 'DELETE',
                        success: function (result) {
                            loadCategories();
                            Swal.fire(
                                'Done!',
                                'Category deleted',
                                'success'
                            );

                        }
                    });
                }
            });
        }


        $('#productModal').click(function () {
            loadProductList();
        });


        $('#usersModal').click(function () {
            loadUserList();
        });


        $('#categoryModal').click(function () {
            loadCategoryList();
        });


        function loadUserList() {

            let counter = 0;
            let user_list = '';
            $('#user_list').empty();
            $('#userList').DataTable().destroy();

            $.get(api + 'users/all', function (users) {



                allUsers = [...users];

                users.forEach((user, index) => {

                    state = [];
                    let class_name = '';

                    if (user.status != "") {
                        state = user.status.split("_");

                        switch (state[0]) {
                            case 'Logged In': class_name = 'btn-default';
                                break;
                            case 'Logged Out': class_name = 'btn-light';
                                break;
                        }
                    }

                    counter++;
                    user_list += `<tr>
            <td>${user.fullname}</td>
            <td>${user.username}</td>
            <td class="${class_name}">${state.length > 0 ? state[0] : ''} <br><span style="font-size: 11px;"> ${state.length > 0 ? moment(state[1]).format('hh:mm A DD MMM YYYY') : ''}</span></td>
            <td>${user._id == 1 ? '<span class="btn-group"><button class="btn btn-dark"><i class="fa fa-edit"></i></button><button class="btn btn-dark"><i class="fa fa-trash"></i></button></span>' : '<span class="btn-group"><button onClick="$(this).editUser(' + index + ')" class="btn btn-warning"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteUser(' + user._id + ')" class="btn btn-danger"><i class="fa fa-trash"></i></button></span>'}</td></tr>`;

                    if (counter == users.length) {

                        $('#user_list').html(user_list);

                        $('#userList').DataTable({
                            "order": [[1, "desc"]]
                            , "autoWidth": false
                            , "info": true
                            , "JQueryUI": true
                            , "ordering": true
                            , "paging": false
                        });
                    }

                });

            });
        }


        function loadProductList() {
            let products = [...allProducts];
            let product_list = '';
            let counter = 0;
            $('#product_list').empty();
            $('#productList').DataTable().destroy();

            products.forEach((product, index) => {

                counter++;

                let category = allCategories.filter(function (category) {
                    return category._id == product.category;
                });


                product_list += `<tr>
            <td><img id="`+ product._id + `"><span style="display:none;">${product.sku || product._id}</span></td>
            <td><img style="max-height: 50px; max-width: 50px; border: 1px solid #ddd;" src="${product.img == "" ? "./assets/images/default.jpg" : img_path + product.img}" id="product_img"></td>
            <td>${product.name}</td>
            <td>${settings.symbol}${product.price}</td>
            <td>${formatTaxTypeLabel(getProductTaxType(product))}</td>
            <td>${product.stock == 1 ? product.quantity : 'N/A'}</td>
            <td>${category.length > 0 ? category[0].name : ''}</td>
            <td class="nobr"><span class="btn-group"><button onClick="$(this).editProduct(${index})" class="btn btn-warning btn-sm"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteProduct(${product._id})" class="btn btn-danger btn-sm"><i class="fa fa-trash"></i></button></span></td></tr>`;

                if (counter == allProducts.length) {

                    $('#product_list').html(product_list);

                    products.forEach(pro => {
                        $("#" + pro._id + "").JsBarcode(String(pro.sku || pro._id), {
                            width: 2,
                            height: 25,
                            fontSize: 14
                        });
                    });

                    $('#productList').DataTable({
                        "order": [[1, "desc"]]
                        , "autoWidth": false
                        , "info": true
                        , "JQueryUI": true
                        , "ordering": true
                        , "paging": false
                    });
                }

            });
        }


        function loadCategoryList() {

            let category_list = '';
            let counter = 0;
            $('#category_list').empty();
            $('#categoryList').DataTable().destroy();

            allCategories.forEach((category, index) => {

                counter++;

                category_list += `<tr>
     
            <td>${category.name}</td>
            <td><span class="btn-group"><button onClick="$(this).editCategory(${index})" class="btn btn-warning"><i class="fa fa-edit"></i></button><button onClick="$(this).deleteCategory(${category._id})" class="btn btn-danger"><i class="fa fa-trash"></i></button></span></td></tr>`;
            });

            if (counter == allCategories.length) {

                $('#category_list').html(category_list);
                $('#categoryList').DataTable({
                    "autoWidth": false
                    , "info": true
                    , "JQueryUI": true
                    , "ordering": true
                    , "paging": false

                });
            }
        }


        $.fn.serializeObject = function () {
            var o = {};
            var a = this.serializeArray();
            $.each(a, function () {
                if (o[this.name]) {
                    if (!o[this.name].push) {
                        o[this.name] = [o[this.name]];
                    }
                    o[this.name].push(this.value || '');
                } else {
                    o[this.name] = this.value || '';
                }
            });
            return o;
        };



        $('#log-out').click(function () {

            Swal.fire({
                title: 'Are you sure?',
                text: "You are about to log out.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Logout'
            }).then((result) => {

                if (result.value) {
                    $.get(api + 'users/logout/' + user._id, function (data) {
                        storage.delete('auth');
                        storage.delete('user');
                        ipcRenderer.send('app-reload', '');
                    });
                }
            });
        });



        $('#settings_form').on('submit', function (e) {
            e.preventDefault();
            let formData = $(this).serializeObject();
            let mac_address;

            api = 'http://' + host + ':' + port + '/api/';

            macaddress.one(function (err, mac) {
                mac_address = mac;
            });

            formData['app'] = $('#app').find('option:selected').text();
            formData['mac'] = mac_address;
            formData['till'] = 1;
            formData['vat_pricing_mode'] = formData.vat_pricing_mode || 'inclusive';

            $('#settings_form').append('<input type="hidden" name="app" value="' + formData.app + '" />');

            if (formData.percentage != "" && !$.isNumeric(formData.percentage)) {
                Swal.fire(
                    'Oops!',
                    'Please make sure the tax value is a number',
                    'warning'
                );
            }
            else {
                storage.set('settings', formData);

                $(this).attr('action', api + 'settings/post');
                $(this).attr('method', 'POST');


                $(this).ajaxSubmit({
                    contentType: 'application/json',
                    success: function (response) {

                        ipcRenderer.send('app-reload', '');

                    }, error: function (data) {
                        console.log(data);
                    }

                });

            }

        });



        $('#net_settings_form').on('submit', function (e) {
            e.preventDefault();
            let formData = $(this).serializeObject();

            if (formData.till == 0 || formData.till == 1) {
                Swal.fire(
                    'Oops!',
                    'Please enter a number greater than 1.',
                    'warning'
                );
            }
            else {
                if (isNumeric(formData.till)) {
                    formData['app'] = $('#app').find('option:selected').text();
                    storage.set('settings', formData);
                    ipcRenderer.send('app-reload', '');
                }
                else {
                    Swal.fire(
                        'Oops!',
                        'Till number must be a number!',
                        'warning'
                    );
                }

            }

        });



        $('#saveUser').on('submit', function (e) {
            e.preventDefault();
            let formData = $(this).serializeObject();

            console.log(formData);

            if (ownUserEdit) {
                if (formData.password != atob(user.password)) {
                    if (formData.password != formData.pass) {
                        Swal.fire(
                            'Oops!',
                            'Passwords do not match!',
                            'warning'
                        );
                    }
                }
            }
            else {
                if (formData.password != atob(allUsers[user_index].password)) {
                    if (formData.password != formData.pass) {
                        Swal.fire(
                            'Oops!',
                            'Passwords do not match!',
                            'warning'
                        );
                    }
                }
            }



            if (formData.password == atob(user.password) || formData.password == atob(allUsers[user_index].password) || formData.password == formData.pass) {
                $.ajax({
                    url: api + 'users/post',
                    type: 'POST',
                    data: JSON.stringify(formData),
                    contentType: 'application/json; charset=utf-8',
                    cache: false,
                    processData: false,
                    success: function (data) {

                        if (ownUserEdit) {
                            ipcRenderer.send('app-reload', '');
                        }

                        else {
                            $('#userModal').modal('hide');

                            loadUserList();

                            $('#Users').modal('show');
                            Swal.fire(
                                'Ok!',
                                'User details saved!',
                                'success'
                            );
                        }


                    }, error: function (data) {
                        console.log(data);
                    }

                });

            }

        });



        $('#app').change(function () {
            if ($(this).find('option:selected').text() == 'Network Point of Sale Terminal') {
                $('#net_settings_form').show(500);
                $('#settings_form').hide(500);
                macaddress.one(function (err, mac) {
                    $("#mac").val(mac);
                });
            }
            else {
                $('#net_settings_form').hide(500);
                $('#settings_form').show(500);
            }

        });



        $('#cashier').click(function () {

            ownUserEdit = true;

            $('#userModal').modal('show');

            $("#user_id").val(user._id);
            $("#fullname").val(user.fullname);
            $("#username").val(user.username);
            $("#password").val(atob(user.password));

        });



        $('#add-user').click(function () {

            if (platform.app != 'Network Point of Sale Terminal') {
                $('.perms').show();
            }

            $("#saveUser").get(0).reset();
            $('#userModal').modal('show');

        });



        $('#settings').click(function () {

            if (platform.app == 'Network Point of Sale Terminal') {
                $('#net_settings_form').show(500);
                $('#settings_form').hide(500);

                $("#ip").val(platform.ip);
                $("#till").val(platform.till);

                macaddress.one(function (err, mac) {
                    $("#mac").val(mac);
                });

                $("#app option").filter(function () {
                    return $(this).text() == platform.app;
                }).prop("selected", true);
            }
            else {
                $('#net_settings_form').hide(500);
                $('#settings_form').show(500);

                $("#settings_id").val("1");
                $("#store").val(settings.store);
                $("#address_one").val(settings.address_one);
                $("#address_two").val(settings.address_two);
                $("#contact").val(settings.contact);
                $("#tax").val(settings.tax);
                $("#symbol").val(settings.symbol);
                $("#percentage").val(settings.percentage);
                $("#vat_pricing_mode").val(settings.vat_pricing_mode || 'inclusive');
                $("#footer").val(settings.footer);
                $("#logo_img").val(settings.img);
                $('#charge_tax').prop("checked", false);
                if (settings.charge_tax == 'on' || settings.charge_tax === true || settings.charge_tax === 1 || settings.charge_tax === '1') {
                    $('#charge_tax').prop("checked", true);
                }
                if (settings.img != "") {
                    $('#logoname').hide();
                    $('#current_logo').html(`<img src="${img_path + settings.img}" alt="">`);
                    $('#rmv_logo').show();
                }

                $("#app option").filter(function () {
                    return $(this).text() == settings.app;
                }).prop("selected", true);
            }




        });


    });


    $('#rmv_logo').click(function () {
        $('#remove_logo').val("1");
        $('#current_logo').hide(500);
        $(this).hide(500);
        $('#logoname').show(500);
    });


    $('#rmv_img').click(function () {
        $('#remove_img').val("1");
        $('#current_img').hide(500);
        $(this).hide(500);
        $('#imagename').show(500);
    });


    $('#print_list').click(async function () {

        $("#loading").show();
        $('#productList').DataTable().destroy();

        try {
            const savePath = await ipcRenderer.invoke('dialog:save-pdf', 'productList.pdf');

            if (savePath) {
                const canvas = await html2canvas($('#all_products').get(0));
                let height = canvas.height * (25.4 / 96);
                let width = canvas.width * (25.4 / 96);
                let pdf = new jsPDF('p', 'mm', 'a4');
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);

                const pdfBuffer = Buffer.from(pdf.output('arraybuffer'));
                _fs.writeFileSync(savePath, pdfBuffer);

                Swal.fire('Downloaded', 'Product list saved successfully.', 'success');
            }
        } catch (err) {
            console.log(err);
            Swal.fire('Download failed', 'Could not save product list PDF.', 'error');
        } finally {
            $("#loading").hide();

            $('#productList').DataTable({
                "order": [[1, "desc"]]
                , "autoWidth": false
                , "info": true
                , "JQueryUI": true
                , "ordering": true
                , "paging": false
            });

            $(".loading").hide();
        }
    });

}


$.fn.print = function () {

    printJS({ printable: receipt, type: 'raw-html' });

}


function loadTransactions() {

    let tills = [];
    let users = [];
    let sales = 0;
    let transact = 0;
    let unique = 0;

    sold_items = [];
    sold = [];

    let counter = 0;
    let transaction_list = '';
    let query = `by-date?start=${start_date}&end=${end_date}&user=${by_user}&status=${by_status}&till=${by_till}`;


    $.get(api + query, function (transactions) {

        if (transactions.length > 0) {


            $('#transaction_list').empty();
            $('#transactionList').DataTable().destroy();

            allTransactions = [...transactions];

            transactions.forEach((trans, index) => {

                sales += parseFloat(trans.total);
                transact++;



                trans.items.forEach(item => {
                    sold_items.push(item);
                });


                if (!tills.includes(trans.till)) {
                    tills.push(trans.till);
                }

                if (!users.includes(trans.user_id)) {
                    users.push(trans.user_id);
                }

                counter++;
                transaction_list += `<tr>
                                <td>${trans.order}</td>
                                <td class="nobr">${moment(trans.date).format('YYYY MMM DD hh:mm:ss')}</td>
                                <td>${settings.symbol + trans.total}</td>
                                <td>${trans.paid == "" ? "" : settings.symbol + trans.paid}</td>
                                <td>${trans.change ? settings.symbol + Math.abs(trans.change).toFixed(2) : ''}</td>
                                <td>${trans.paid == "" ? "" : "Cash"}</td>
                                <td>${trans.till}</td>
                                <td>${trans.user}</td>
                                <td>${trans.paid == "" ? '<button class="btn btn-dark"><i class="fa fa-search-plus"></i></button>' : '<button onClick="$(this).viewTransaction(' + index + ')" class="btn btn-info"><i class="fa fa-search-plus"></i></button></td>'}</tr>
                    `;

                if (counter == transactions.length) {

                    $('#total_sales #counter').text(settings.symbol + parseFloat(sales).toFixed(2));
                    $('#total_transactions #counter').text(transact);

                    const result = {};

                    for (const { product_name, price, quantity, id } of sold_items) {
                        if (!result[product_name]) result[product_name] = [];
                        result[product_name].push({ id, price, quantity });
                    }

                    for (item in result) {

                        let price = 0;
                        let quantity = 0;
                        let id = 0;

                        result[item].forEach(i => {
                            id = i.id;
                            price = i.price;
                            quantity += i.quantity;
                        });

                        sold.push({
                            id: id,
                            product: item,
                            qty: quantity,
                            price: price
                        });
                    }

                    loadSoldProducts();


                    if (by_user == 0 && by_till == 0) {

                        userFilter(users);
                        tillFilter(tills);
                    }


                    $('#transaction_list').html(transaction_list);
                    $('#transactionList').DataTable({
                        "order": [[1, "desc"]]
                        , "autoWidth": false
                        , "info": true
                        , "JQueryUI": true
                        , "ordering": true
                        , "paging": true,
                        "dom": 'Bfrtip',
                        "buttons": ['csv', 'excel', 'pdf',]

                    });
                }
            });
        }
        else {
            Swal.fire(
                'No data!',
                'No transactions available within the selected criteria',
                'warning'
            );
        }

    });
}


function discend(a, b) {
    if (a.qty > b.qty) {
        return -1;
    }
    if (a.qty < b.qty) {
        return 1;
    }
    return 0;
}


function loadSoldProducts() {

    sold.sort(discend);

    let counter = 0;
    let sold_list = '';
    let items = 0;
    let products = 0;
    $('#product_sales').empty();

    sold.forEach((item, index) => {

        items += item.qty;
        products++;

        let product = allProducts.filter(function (selected) {
            return selected._id == item.id;
        });

        counter++;

        sold_list += `<tr>
            <td>${item.product}</td>
            <td>${item.qty}</td>
            <td>${product[0].stock == 1 ? product.length > 0 ? product[0].quantity : '' : 'N/A'}</td>
            <td>${settings.symbol + (item.qty * parseFloat(item.price)).toFixed(2)}</td>
            </tr>`;

        if (counter == sold.length) {
            $('#total_items #counter').text(items);
            $('#total_products #counter').text(products);
            $('#product_sales').html(sold_list);
        }
    });
}


function userFilter(users) {

    $('#users').empty();
    $('#users').append(`<option value="0">All</option>`);

    users.forEach(user => {
        let u = allUsers.filter(function (usr) {
            return usr._id == user;
        });

        $('#users').append(`<option value="${user}">${u[0].fullname}</option>`);
    });

}


function tillFilter(tills) {

    $('#tills').empty();
    $('#tills').append(`<option value="0">All</option>`);
    tills.forEach(till => {
        $('#tills').append(`<option value="${till}">${till}</option>`);
    });

}


$.fn.viewTransaction = function (index) {

    transaction_index = index;

    let discount = allTransactions[index].discount;
    let refNumber = allTransactions[index].ref_number != "" ? allTransactions[index].ref_number : allTransactions[index].order;
    let orderNumber = allTransactions[index].order;
    let type = "";
    let payment = 0;
    let tax_rows = "";
    let items = "";
    let products = allTransactions[index].items;
    let customerName = allTransactions[index].customer == 0 ? 'Walk in customer' : allTransactions[index].customer.name;
    let customerTin = allTransactions[index].customer && allTransactions[index].customer.tin ? allTransactions[index].customer.tin : '';
    let customerAddress = allTransactions[index].customer && allTransactions[index].customer.address ? allTransactions[index].customer.address : '';
    let breakdown = {
        taxable: parseFloat(allTransactions[index].taxable_sales || 0),
        exempt: parseFloat(allTransactions[index].exempt_sales || 0),
        zeroRated: parseFloat(allTransactions[index].zero_rated_sales || 0)
    };
    let classification_rows = buildVatClassificationRows(breakdown);

    products.forEach(item => {
        let unitPrice = parseFloat(item.price);
        let lineAmount = unitPrice * parseFloat(item.quantity);
        items += "<tr><td>" + item.product_name + " <small>(" + formatTaxTypeLabel(getProductTaxType(item)) + ")</small></td><td style=\"text-align:center;\">" + item.quantity + "</td><td style=\"text-align:right;\">" + settings.symbol + unitPrice.toFixed(2) + "</td><td style=\"text-align:right;\">" + settings.symbol + lineAmount.toFixed(2) + "</td></tr>";

    });


    type = "Cash";


    if (allTransactions[index].paid != "") {
        payment = `<tr>
                    <td colspan="3">Amount Tendered</td>
                    <td style="text-align:right;">${settings.symbol + allTransactions[index].paid}</td>
                </tr>
                <tr>
                    <td colspan="3">Change</td>
                    <td style="text-align:right;">${settings.symbol + Math.abs(allTransactions[index].change).toFixed(2)}</td>
                </tr>
                <tr>
                    <td colspan="3">Payment Method</td>
                    <td style="text-align:right;">${type}</td>
                </tr>`
    }

    tax_rows = buildTaxRowsForReceipt(breakdown, allTransactions[index].tax, allTransactions[index].vat_pricing_mode || getVatPricingMode());



    receipt = `<div style="font-size: 10px;">                            
        <p style="text-align: center;">
        ${settings.img == "" ? settings.img : '<img style="max-width: 50px;max-width: 100px;" src ="' + img_path + settings.img + '" /><br>'}
            <span style="font-size: 22px;">${settings.store}</span> <br>
            <span style="font-size:16px; font-weight:bold;">INVOICE</span><br>
            ${settings.address_one} <br>
            ${settings.address_two} <br>
            ${settings.contact != '' ? 'Tel: ' + settings.contact + '<br>' : ''} 
            ${settings.tax != '' ? 'VAT REG TIN: ' + settings.tax + '<br>' : 'VAT REG TIN: ____________________<br>'}
    </p>
    <hr>
    <left>
        <p>
        Invoice No : ${orderNumber} <br>
        Date : ${moment(allTransactions[index].date).format('DD MMM YYYY HH:mm:ss')}<br>
        Ref No : ${refNumber} <br>
        Sold To : ${customerName} <br>
        Buyer TIN : ${customerTin}<br>
        Buyer Address : ${customerAddress}<br>
        Cashier : ${allTransactions[index].user} <br>
        </p>

    </left>
    <hr>
    <table width="100%">
        <thead style="text-align: left;">
        <tr>
            <th>Item</th>
            <th>Qty</th>
            <th style="text-align:right;">Unit Price</th>
            <th style="text-align:right;">Amount</th>
        </tr>
        </thead>
        <tbody>
        ${items}                
 
        <tr>                        
            <td colspan="3"><b>${(allTransactions[index].vat_pricing_mode || getVatPricingMode()) === 'inclusive' ? 'Total Sales (VAT Inclusive)' : 'Total Sales (VAT Exclusive)'}</b></td>
            <td style="text-align:right;"><b>${settings.symbol}${parseFloat(allTransactions[index].subtotal).toFixed(2)}</b></td>
        </tr>
        <tr>
            <td colspan="3">Less: Discount</td>
            <td style="text-align:right;">${discount > 0 ? settings.symbol + parseFloat(allTransactions[index].discount).toFixed(2) : settings.symbol + '0.00'}</td>
        </tr>
        
        ${tax_rows}
        ${classification_rows}
    
        <tr>
            <td colspan="3"><h4>Total Amount Due (VAT Inclusive)</h4></td>
            <td style="text-align:right;"><h4>${settings.symbol}${parseFloat(allTransactions[index].total).toFixed(2)}</h4></td>
        </tr>
        ${payment == 0 ? '' : payment}
        </tbody>
        </table>
        <br>
        <hr>
        <br>
        <p style="text-align: center;">
         ${settings.footer}
         </p>
        </div>`;

    $('#viewTransaction').html('');
    $('#viewTransaction').html(receipt);

    $('#orderModal').modal('show');

}


$('#status').change(function () {
    by_status = $(this).find('option:selected').val();
    loadTransactions();
});



$('#tills').change(function () {
    by_till = $(this).find('option:selected').val();
    loadTransactions();
});


$('#users').change(function () {
    by_user = $(this).find('option:selected').val();
    loadTransactions();
});


$('#reportrange').on('apply.daterangepicker', function (ev, picker) {

    start = picker.startDate.format('DD MMM YYYY hh:mm A');
    end = picker.endDate.format('DD MMM YYYY hh:mm A');

    start_date = picker.startDate.toDate().toJSON();
    end_date = picker.endDate.toDate().toJSON();


    loadTransactions();
});


function authenticate() {
    $('#loading').append(
        `<div id="load"><form id="account"><div class="form-group"><input type="text" placeholder="Username" name="username" class="form-control"></div>
        <div class="form-group"><input type="password" placeholder="Password" name="password" class="form-control"></div>
        <div class="form-group"><input type="submit" class="btn btn-block btn-default" value="Login"></div></form>`
    );
}


$('body').on("submit", "#account", function (e) {
    e.preventDefault();
    let formData = $(this).serializeObject();

    if (formData.username == "" || formData.password == "") {

        Swal.fire(
            'Incomplete form!',
            auth_empty,
            'warning'
        );
    }
    else {

        $.ajax({
            url: api + 'users/login',
            type: 'POST',
            data: JSON.stringify(formData),
            contentType: 'application/json; charset=utf-8',
            cache: false,
            processData: false,
            success: function (data) {
                if (data._id) {
                    storage.set('auth', { auth: true });
                    storage.set('user', data);
                    ipcRenderer.send('app-reload', '');
                }
                else {
                    Swal.fire(
                        'Oops!',
                        auth_error,
                        'warning'
                    );
                }

            }, error: function (data) {
                console.log(data);
            }
        });
    }
});


$('#quit').click(function () {
    Swal.fire({
        title: 'Are you sure?',
        text: "You are about to close the application.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Close Application'
    }).then((result) => {

        if (result.value) {
            ipcRenderer.send('app-quit', '');
        }
    });
});



