#[test_only]
module octapoint::credit_tests;

use octapoint::credit::{Self, Credit, MintCap, PlatformCap};
use sui::test_scenario::{Self, Scenario};

const PLATFORM: address = @0xA;
const MERCHANT: address = @0xB;
const ALICE: address = @0xC;
const BOB: address = @0xD;

fun setup(): Scenario {
    let mut s = test_scenario::begin(PLATFORM);
    credit::init_for_testing(s.ctx());
    s.next_tx(PLATFORM);
    let admin = s.take_from_sender<PlatformCap>();
    credit::create_merchant(&admin, MERCHANT, s.ctx());
    s.return_to_sender(admin);
    s.next_tx(MERCHANT);
    s
}

fun mint_alice(s: &mut Scenario): ID {
    let cap = s.take_from_sender<MintCap>();
    let merchant_id = object::id(&cap);
    credit::mint(&cap, 25, ALICE, s.ctx());
    s.return_to_sender(cap);
    s.next_tx(ALICE);
    merchant_id
}

#[test]
fun mint_then_transfer() {
    let mut s = setup();
    let merchant_id = mint_alice(&mut s);
    let c = s.take_from_sender<Credit>();
    let original_id = object::id(&c);
    assert!(credit::amount(&c) == 25);
    assert!(credit::owner(&c) == ALICE);
    assert!(credit::merchant_id(&c) == merchant_id);
    credit::transfer_credit(c, merchant_id, BOB, s.ctx());
    s.next_tx(BOB);
    assert!(!test_scenario::has_most_recent_for_address<Credit>(ALICE));
    let received = s.take_from_sender<Credit>();
    assert!(object::id(&received) == original_id);
    assert!(credit::amount(&received) == 25);
    assert!(credit::owner(&received) == BOB);
    assert!(credit::merchant_id(&received) == merchant_id);
    s.return_to_sender(received);
    s.end();
}

#[test, expected_failure(abort_code = 0, location = octapoint::credit)]
fun reject_zero_mint() {
    let mut s = setup();
    let cap = s.take_from_sender<MintCap>();
    credit::mint(&cap, 0, ALICE, s.ctx());
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = 5, location = octapoint::credit)]
fun reject_amount_above_database_limit() {
    let mut s = setup();
    let cap = s.take_from_sender<MintCap>();
    credit::mint(&cap, 2147483648, ALICE, s.ctx());
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = 1, location = octapoint::credit)]
fun reject_zero_mint_recipient() {
    let mut s = setup();
    let cap = s.take_from_sender<MintCap>();
    credit::mint(&cap, 25, @0x0, s.ctx());
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = 2, location = octapoint::credit)]
fun reject_wrong_mint_signer() {
    let mut s = setup();
    s.next_tx(BOB);
    // Only the test harness can take another address's object this way.
    let cap = test_scenario::take_from_address<MintCap>(&s, MERCHANT);
    credit::mint(&cap, 25, BOB, s.ctx());
    test_scenario::return_to_address(MERCHANT, cap);
    s.end();
}

#[test, expected_failure(abort_code = 2, location = octapoint::credit)]
fun reject_wrong_transfer_owner() {
    let mut s = setup();
    let merchant_id = mint_alice(&mut s);
    s.next_tx(BOB);
    let c = test_scenario::take_from_address<Credit>(&s, ALICE);
    credit::transfer_credit(c, merchant_id, MERCHANT, s.ctx());
    s.end();
}

#[test, expected_failure(abort_code = 3, location = octapoint::credit)]
fun reject_wrong_merchant_id() {
    let mut s = setup();
    mint_alice(&mut s);
    let c = s.take_from_sender<Credit>();
    credit::transfer_credit(c, object::id_from_address(@0xBAD), BOB, s.ctx());
    s.end();
}

#[test, expected_failure(abort_code = 4, location = octapoint::credit)]
fun reject_self_transfer() {
    let mut s = setup();
    let merchant_id = mint_alice(&mut s);
    let c = s.take_from_sender<Credit>();
    credit::transfer_credit(c, merchant_id, ALICE, s.ctx());
    s.end();
}

#[test, expected_failure(abort_code = 1, location = octapoint::credit)]
fun reject_zero_transfer_recipient() {
    let mut s = setup();
    let merchant_id = mint_alice(&mut s);
    let c = s.take_from_sender<Credit>();
    credit::transfer_credit(c, merchant_id, @0x0, s.ctx());
    s.end();
}
