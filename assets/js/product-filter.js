$(document).ready(function(){

    $('#categories').on('click', '.btn-categories', function(){

        if (this.id == 'all') {
            $('#parent > div').fadeIn(450);
        } else {
            var $el = $('.' + this.id).fadeIn(450);
            $('#parent > div').not($el).hide();
        }
 
        $("#categories .btn-categories").removeClass("active");
        $(this).addClass('active');

    });

 
    function searchProducts () {        
        $("#categories .btn-categories").removeClass("active");
        var matcher = new RegExp($("#search").val(), 'gi');
        $('.box').show().not(function(){
            return matcher.test($(this).find('.name, .sku').text())
        }).hide();
    }

    let $search = $("#search").on('input',function(){
        searchProducts();       
    });


    $('body').on('click', '#jq-keyboard button', function(e) {
        if($("#search").is(":focus")) {
            searchProducts(); 
        }          
    });


    function searchOpenOrders() {
        var matcher = new RegExp($("#holdOrderInput").val(), 'gi');
        $('.order').show().not(function(){
            return matcher.test($(this).find('.ref_number').text())
        }).hide();

    }

    var $searchHoldOrder = $("#holdOrderInput").on('input',function () {
        searchOpenOrders();
    });


    $('body').on('click', '.holdOrderKeyboard .key', function() {
        if($("#holdOrderInput").is(":focus")) {
            searchOpenOrders(); 
        }          
    });
 
  
    function searchCustomerOrders() {
        var matcher = new RegExp($("#holdCustomerOrderInput").val(), 'gi');
        $('.customer-order').show().not(function(){
            return matcher.test($(this).find('.customer_name').text())
        }).hide();
    }

    var $searchCustomerOrder = $("#holdCustomerOrderInput").on('input',function () {
        searchCustomerOrders();
    });


    $('body').on('click', '.customerOrderKeyboard .key', function() {
        if($("#holdCustomerOrderInput").is(":focus")) {
            searchCustomerOrders();
        }          
    });
 

    $.fn.go = function (value,isDueInput) {
        if(isDueInput){
            $("#refNumber").val($("#refNumber").val()+""+value)
        }else{
            if ($("#payment").prop('readonly')) return;
            $("#payment").val($("#payment").val()+""+value);
            $(this).calculateChange();
        }
    }


    $.fn.digits = function(){
        if ($("#payment").prop('readonly')) return;
        $("#payment").val($("#payment").val()+".");
        $(this).calculateChange();
    }

    $.fn.calculateChange = function () {
        let payable = parseFloat($("#payablePrice").val());
        let paid = parseFloat($("#payment").val());

        if (isNaN(payable) || isNaN(paid)) {
            $("#change").text('0.00');
            $("#confirmPayment").hide();
            return;
        }

        let change = payable - paid;
        if(change <= 0){
            $("#change").text(change.toFixed(2));
        }else{
            $("#change").text('0.00')
        }

        if(change <= 0){
            $("#confirmPayment").show();
        }else{
            $("#confirmPayment").hide();
        }
    }

})
